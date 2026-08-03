import { NextRequest, NextResponse } from "next/server";
import { getPopularGalleries } from "@/lib/gallery-views";

export const runtime = "nodejs";

/**
 * Top galleries by local PV (Redis ZSET). Homepage reads Redis in RSC;
 * this route is for debug / future clients.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(
    12,
    Math.max(1, parseInt(raw || "8", 10) || 8)
  );

  const items = await getPopularGalleries(limit);
  return NextResponse.json(
    { items, count: items.length },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
