import { NextRequest, NextResponse } from "next/server";
import { getGalleries } from "@/lib/api";
import { resolveGalleryBoundary } from "@/lib/start-offset";
import {
  GALLERY_BOUNDARY_UNAVAILABLE,
  upstreamJsonError,
} from "@/lib/upstream-error";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const requestedLimit = Number.parseInt(searchParams.get("limit") || "12", 10);
  const limit = Math.min(
    24,
    Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 12)
  );
  const rawOffset = searchParams.get("offset")?.trim();
  // Upstream list has no category filter; ignore any category query.
  try {
    const boundary = rawOffset ? null : await resolveGalleryBoundary();
    if (boundary?.status === "unavailable") {
      return NextResponse.json(
        {
          error: GALLERY_BOUNDARY_UNAVAILABLE,
          boundary: boundary.status,
          reason: boundary.reason,
        },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
    const offset = rawOffset
      ? Math.max(0, Number.parseInt(rawOffset, 10) || 0)
      : boundary!.offset;
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
