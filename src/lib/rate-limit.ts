import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "./redis";
import { UpstreamRateLimitError } from "./upstream-error";

/**
 * Per-region rate limiters for upstream traffic + gallery view dedupe.
 *
 * 1) Shared bucket (`rl:upstream`): generic JSON — 100 / 300s / region.
 * 2) Image bucket (`rl:image-upstream`): image attempts — configurable / 300s.
 * 3) Tag-preview bucket (`rl:tag-preview`): only `/v1/tag/.../preview`
 *    — 60 / 300s / region (stricter endpoint policy; no local ban tracking).
 * 4) Gallery view bucket (`rl:view`): 1 / 300s per IP + galleryId (beacon dedupe).
 *
 * Fail-open when Redis is missing or errors.
 */

const SHARED_LIMIT = 100;
const SHARED_WINDOW = "300 s";

const DEFAULT_IMAGE_LIMIT = 100;
const IMAGE_WINDOW = "300 s";

const TAG_PREVIEW_LIMIT = 60;
const TAG_PREVIEW_WINDOW = "300 s";

/** One counted view per IP per gallery within the window. */
const VIEW_LIMIT = 1;
const VIEW_WINDOW = "300 s";

let sharedLimiter: Ratelimit | null = null;
let imageLimiter: Ratelimit | null = null;
let tagPreviewLimiter: Ratelimit | null = null;
let viewLimiter: Ratelimit | null = null;
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

export function imageProxyRateLimit(): number {
  const configured = Number(process.env.IMAGE_PROXY_RATE_LIMIT);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_IMAGE_LIMIT;
}

function getImageLimiter() {
  if (imageLimiter) return imageLimiter;
  imageLimiter = createLimiter(
    imageProxyRateLimit(),
    IMAGE_WINDOW,
    "rl:image-upstream"
  );
  return imageLimiter;
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

function getViewLimiter() {
  if (viewLimiter) return viewLimiter;
  viewLimiter = createLimiter(VIEW_LIMIT, VIEW_WINDOW, "rl:view");
  return viewLimiter;
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

/** Consume one image attempt. Resin capacity is global; direct capacity is regional. */
export async function checkImageUpstreamRateLimit(
  resinEnabled: boolean,
  region: string = currentRegion()
): Promise<RateLimitResult> {
  return runLimit(
    getImageLimiter(),
    resinEnabled ? "pool:resin" : `region:${region}`,
    imageProxyRateLimit()
  );
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

/**
 * Gallery detail view beacon: 1 counted view / 300s per IP + galleryId.
 * Non-throwing; caller treats !allowed as skip (still HTTP 204).
 */
export async function checkGalleryViewRateLimit(
  ip: string,
  galleryId: string | number
): Promise<RateLimitResult> {
  const safeIp = (ip || "unknown").slice(0, 128);
  return runLimit(
    getViewLimiter(),
    `${safeIp}:${galleryId}`,
    VIEW_LIMIT
  );
}
