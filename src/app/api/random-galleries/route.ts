import { NextRequest, NextResponse } from "next/server";
import { getRandomGalleries } from "@/lib/api";
import { upstreamJsonError } from "@/lib/upstream-error";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const count = Math.min(
    24,
    Math.max(1, parseInt(searchParams.get("count") || "8", 10) || 8)
  );

  try {
    const items = await getRandomGalleries(count);
    return NextResponse.json(
      { items, count: items.length },
      {
        headers: {
          // Random set should not be shared long; short CDN window is ok.
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (e) {
    return upstreamJsonError(e, 500);
  }
}
