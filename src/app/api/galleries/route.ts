import { NextRequest, NextResponse } from "next/server";
import { getGalleries } from "@/lib/api";
import { getCachedStartOffset } from "@/lib/start-offset";

export const revalidate = 300;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const limit = Math.min(24, Math.max(1, parseInt(searchParams.get("limit") || "12", 10)));
  const rawOffset = searchParams.get("offset");
  // If no offset provided, start from calibrated startOffset
  const offset =
    rawOffset !== null && rawOffset !== ""
      ? Math.max(0, parseInt(rawOffset, 10) || 0)
      : getCachedStartOffset();
  const category = searchParams.get("category") || undefined;
  try {
    const data = await getGalleries(limit, offset, category);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    return NextResponse.json(
      { error: message },
      { status: message === "RATE_LIMIT" ? 429 : 500 }
    );
  }
}
