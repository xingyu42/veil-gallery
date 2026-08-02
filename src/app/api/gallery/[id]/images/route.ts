import { NextRequest, NextResponse } from "next/server";
import { getGalleryImages } from "@/lib/api";
import { upstreamJsonError } from "@/lib/upstream-error";

export const revalidate = 300;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const offset = Math.max(
    0,
    Number.parseInt(request.nextUrl.searchParams.get("offset") || "0", 10) || 0
  );
  const limit = Math.min(
    40,
    Math.max(
      1,
      Number.parseInt(request.nextUrl.searchParams.get("limit") || "20", 10) ||
        20
    )
  );

  const total = Math.max(
    0,
    Number.parseInt(request.nextUrl.searchParams.get("total") || "0", 10) || 0
  );
  const after = Math.max(
    0,
    Number.parseInt(request.nextUrl.searchParams.get("after") || String(offset), 10) ||
      offset
  );

  try {
    const data = await getGalleryImages(id, offset, limit, total, after);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
      },
    });
  } catch (error) {
    return upstreamJsonError(error, 502, "加载失败");
  }
}
