import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "./redis";
import { UpstreamRateLimitError } from "./upstream-error";

/**
 * Per-region rate limiters for upstream traffic.
 *
 * 1) Shared bucket (`rl:upstream`): all image MISS + JSON — 100 / 300s / region
 *    Aligns with the generic upstream IP budget.
 * 2) Tag-preview bucket (`rl:tag-preview`): only `/v1/tag/.../preview`
 *    — 60 / 300s / region (stricter endpoint policy; no local ban tracking).
 *
 * Fail-open when Redis is missing or errors.
 */

const SHARED_LIMIT = 100;
const SHARED_WINDOW = "300 s";

const TAG_PREVIEW_LIMIT = 60;
const TAG_PREVIEW_WINDOW = "300 s";

let sharedLimiter: Ratelimit | null = null;
let tagPreviewLimiter: Ratelimit | null = null;
let redisWarned = false;

function warnNoRedisOnce() {
  if (redisWarned) return;
  redisWarned = true;
  console.warn(
    "[rate-limit] Redis env not set (UPSTASH_* or KV_REST_API_*) — rate limiting DISABLED"
  );
}

function createLimiter(
  limit: number,
  window: `${number} s`,
  prefix: string
): Ratelimit | null {
  const redis = getRedis();
  if (!redis) {
    warnNoRedisOnce();
    return null;
  }

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    analytics: false,
    prefix,
  });
}

function getSharedLimiter() {
  if (sharedLimiter) return sharedLimiter;
  sharedLimiter = createLimiter(SHARED_LIMIT, SHARED_WINDOW, "rl:upstream");
  return sharedLimiter;
}

function getTagPreviewLimiter() {
  if (tagPreviewLimiter) return tagPreviewLimiter;
  tagPreviewLimiter = createLimiter(
    TAG_PREVIEW_LIMIT,
    TAG_PREVIEW_WINDOW,
    "rl:tag-preview"
  );
  return tagPreviewLimiter;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

function currentRegion(): string {
  return process.env.VERCEL_REGION || "dev";
}

async function runLimit(
  limiter: Ratelimit | null,
  key: string,
  fallbackLimit: number
): Promise<RateLimitResult> {
  if (!limiter) {
    return {
      allowed: true,
      limit: fallbackLimit,
      remaining: fallbackLimit,
      resetMs: 0,
    };
  }

  try {
    const { success, limit, remaining, reset } = await limiter.limit(key);
    return {
      allowed: success,
      limit,
      remaining,
      resetMs: Math.max(0, reset - Date.now()),
    };
  } catch (error) {
    console.error("[rate-limit] Redis error:", error);
    return { allowed: true, limit: fallbackLimit, remaining: -1, resetMs: 0 };
  }
}

async function consume(
  check: (region: string) => Promise<RateLimitResult>,
  region: string
): Promise<RateLimitResult> {
  const result = await check(region);
  if (!result.allowed) {
    throw new UpstreamRateLimitError(result.resetMs);
  }
  return result;
}

/**
 * Shared per-region quota (images + generic JSON).
 * Non-throwing — image proxy needs raw result for 429 headers.
 */
export async function checkUpstreamRateLimit(
  region: string = currentRegion()
): Promise<RateLimitResult> {
  return runLimit(getSharedLimiter(), `region:${region}`, SHARED_LIMIT);
}

/**
 * Consume one unit of the shared per-region upstream quota.
 * Throws UpstreamRateLimitError when the window is exhausted.
 */
export async function consumeUpstreamRateLimit(
  region: string = currentRegion()
): Promise<RateLimitResult> {
  return consume(checkUpstreamRateLimit, region);
}

/** Tag-preview endpoint quota: 60 / 300s / region (does not track upstream ban). */
function checkTagPreviewRateLimit(
  region: string = currentRegion()
): Promise<RateLimitResult> {
  return runLimit(
    getTagPreviewLimiter(),
    `region:${region}`,
    TAG_PREVIEW_LIMIT
  );
}

/**
 * Consume tag-preview quota. Throws UpstreamRateLimitError when exhausted.
 */
export async function consumeTagPreviewRateLimit(
  region: string = currentRegion()
): Promise<RateLimitResult> {
  return consume(checkTagPreviewRateLimit, region);
}
