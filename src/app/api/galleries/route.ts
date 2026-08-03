import { NextRequest, NextResponse } from "next/server";
import { getGalleries } from "@/lib/api";
import { getStartOffset } from "@/lib/start-offset";
import { upstreamJsonError } from "@/lib/upstream-error";

export const revalidate = 300;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const limit = Math.min(
    24,
    Math.max(1, parseInt(searchParams.get("limit") || "12", 10))
  );
  const rawOffset = searchParams.get("offset");
  // Upstream list has no category filter; ignore any category query.
  const offset =
    rawOffset !== null && rawOffset !== ""
      ? Math.max(0, parseInt(rawOffset, 10) || 0)
      : await getStartOffset();
  try {
    const data = await getGalleries(limit, offset);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (e) {
    return upstreamJsonError(e, 500);
  }
}
