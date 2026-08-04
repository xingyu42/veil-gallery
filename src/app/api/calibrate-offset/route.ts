import { NextRequest, NextResponse } from "next/server";

import {
  getDefaultStartOffset,
  resolveGalleryBoundary,
} from "@/lib/start-offset";
import { getRedis } from "@/lib/redis";
import {
  GALLERY_BOUNDARY_UNAVAILABLE,
  upstreamJsonError,
} from "@/lib/upstream-error";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Manually force the same binary recovery used by automatic initialization. */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const secret = process.env.CRON_SECRET;
  if (!secret || secret === "change-me" || key !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const diagnostics = () => ({
    bootstrap: getDefaultStartOffset(),
    redis: Boolean(getRedis()),
  });

  try {
    const boundary = await resolveGalleryBoundary({ forceRecovery: true });
    if (boundary.status !== "ready") {
      return NextResponse.json(
        {
          ok: false,
          error: GALLERY_BOUNDARY_UNAVAILABLE,
          boundary,
          ...diagnostics(),
        },
        { status: 503, headers: NO_STORE }
      );
    }

    return NextResponse.json(
      { ok: true, boundary, ...diagnostics(), source: "manual" },
      { headers: NO_STORE }
    );
  } catch (error) {
    return upstreamJsonError(
      error,
      500,
      "boundary recovery failed",
      diagnostics()
    );
  }
}
