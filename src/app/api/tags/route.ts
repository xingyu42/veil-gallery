import { NextResponse } from "next/server";
import { getAllTags } from "@/lib/api";
import { upstreamJsonError } from "@/lib/upstream-error";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getAllTags();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    return upstreamJsonError(error, 500);
  }
}
