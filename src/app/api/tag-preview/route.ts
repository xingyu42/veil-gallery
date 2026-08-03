import { NextRequest, NextResponse } from "next/server";
import { USER_AGENT, upstreamUrl } from "@/lib/upstream";
import { getUpstreamError, upstreamJsonError } from "@/lib/upstream-error";

export const dynamic = "force-dynamic";

/**
 * Fresh tag preview (upstream returns up to 6 random image ids per call).
 * Used by the tag page "换一批" button — must not hit the long revalidate cache.
 */
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name")?.trim();
  if (!name) {
    return NextResponse.json({ error: "missing name" }, { status: 400 });
  }

  try {
    const res = await fetch(
      upstreamUrl(`/v1/tag/${encodeURIComponent(name)}/preview`),
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(12_000),
      }
    );
    if (!res.ok) {
      const upstreamError = getUpstreamError(res.status);
      if (upstreamError) throw upstreamError;
      throw new Error(`API ${res.status}`);
    }
    const data = (await res.json()) as { image_ids?: number[]; tag?: string };
    return NextResponse.json(
      {
        tag: data.tag ?? name,
        image_ids: Array.isArray(data.image_ids) ? data.image_ids : [],
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (e) {
    return upstreamJsonError(e, 500);
  }
}
