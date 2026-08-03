import { NextResponse } from "next/server";
import { getImageMeta } from "@/lib/api";
import { upstreamJsonError } from "@/lib/upstream-error";

export const revalidate = 86400;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  try {
    const meta = await getImageMeta(id);
    return NextResponse.json(meta, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (e) {
    return upstreamJsonError(e, 500);
  }
}
