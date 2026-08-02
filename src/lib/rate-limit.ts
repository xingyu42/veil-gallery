import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

/**
 * Per-region rate limiter for upstream image fetches.
 *
 * Uses Upstash Redis with sliding window algorithm. Each Vercel Edge region
 * has its own outbound IP pool, so we limit each region separately to prevent
 * any single IP from exceeding upstream's rate limit.
 *
 * Upstream limit: ~100 req / 5 min per IP.
 * Our target: 100 req / 5 min per region (match upstream limit).
 *
 * Cost (Upstash free tier):
 * - 500K commands/month free
 * - Each limit check = ~3 commands (ZADD + ZREMRANGEBYSCORE + ZCARD)
 * - Free tier supports ~166K image fetches/month across all regions
 */

let ratelimit: Ratelimit | null = null;

function getRatelimiter() {
  if (ratelimit) return ratelimit;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn(
      "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not set — rate limiting DISABLED"
    );
    return null;
  }

  const redis = new Redis({ url, token });

  ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, "300 s"), // 100 requests per 5 minutes
    analytics: false, // Disable to save commands
    prefix: "rl:upstream",
  });

  return ratelimit;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

/**
 * Check if an upstream fetch is allowed under the per-region rate limit.
 *
 * Each Vercel Edge region has its own outbound IP pool. We limit each region
 * separately to 100 req/5min (matching upstream's limit per IP).
 *
 * Region identifier comes from process.env.VERCEL_REGION (e.g., "iad1", "hnd1").
 * If unavailable (local dev), falls back to "dev".
 */
export async function checkUpstreamRateLimit(
  region: string
): Promise<RateLimitResult> {
  const limiter = getRatelimiter();

  if (!limiter) {
    // Rate limiting not configured — allow but log warning
    return { allowed: true, limit: 100, remaining: 100, resetMs: 0 };
  }

  try {
    const { success, limit, remaining, reset } = await limiter.limit(
      `region:${region}`
    );

    return {
      allowed: success,
      limit,
      remaining,
      resetMs: reset - Date.now(),
    };
  } catch (error) {
    // Redis failure — fail open (allow request) to prevent service outage
    console.error("[rate-limit] Redis error:", error);
    return { allowed: true, limit: 100, remaining: -1, resetMs: 0 };
  }
}
