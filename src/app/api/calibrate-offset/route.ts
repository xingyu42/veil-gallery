import { NextRequest, NextResponse } from "next/server";
import {
  probeStartOffset,
  getStartOffset,
  getDefaultStartOffset,
} from "@/lib/start-offset";
import { getRedis } from "@/lib/redis";
import { upstreamJsonError } from "@/lib/upstream-error";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Calibration endpoint.
 * - Vercel Cron: sends `x-vercel-cron: 1`
 * - Manual: optional `?key=` matching CRON_SECRET when env is set
 *
 * Writes startOffset to Upstash Redis so all instances share one value.
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
    const cached = await getStartOffset();
    return NextResponse.json({
      ok: true,
      ...result,
      cached,
      bootstrap: getDefaultStartOffset(),
      redis: Boolean(getRedis()),
      source: isVercelCron ? "cron" : "manual",
      note: result.partial
        ? "Partial calibration written; binary refine incomplete under budget"
        : "Offset stored in Upstash Redis (cross-instance) + process memory",
    });
  } catch (e) {
    return upstreamJsonError(e, 500, "probe failed", {
      fallback: await getStartOffset(),
      bootstrap: getDefaultStartOffset(),
      redis: Boolean(getRedis()),
    });
  }
}
