import { NextRequest, NextResponse } from "next/server";
import {
  probeStartOffset,
  getCachedStartOffset,
  getDefaultStartOffset,
} from "@/lib/start-offset";
import { upstreamJsonError } from "@/lib/upstream-error";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Calibration endpoint.
 * - Vercel Cron: sends `x-vercel-cron: 1`
 * - Manual: optional `?key=` matching CRON_SECRET when env is set
 */
export async function GET(req: NextRequest) {
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const key = req.nextUrl.searchParams.get("key");
  const secret = process.env.CRON_SECRET;

  if (!isVercelCron) {
    if (secret && key !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await probeStartOffset(0.5);
    return NextResponse.json({
      ok: true,
      ...result,
      cached: getCachedStartOffset(),
      default: getDefaultStartOffset(),
      source: isVercelCron ? "cron" : "manual",
      note: "Offset cached in-memory on this instance; default used as cross-instance fallback",
    });
  } catch (e) {
    return upstreamJsonError(e, 500, "probe failed", {
      fallback: getCachedStartOffset(),
      default: getDefaultStartOffset(),
    });
  }
}
