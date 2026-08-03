import { NextResponse } from "next/server";
import { checkUpstreamRateLimit } from "@/lib/rate-limit";
import { rateLimitResponseHeaders } from "@/lib/upstream-error";
import { USER_AGENT, upstreamImageUrl } from "@/lib/upstream";

export const runtime = "edge";

/**
 * Budget for upstream *headers* only. Once headers arrive we clear the timer
 * so large bodies can stream past this window (AbortSignal.timeout would kill
 * the body mid-transfer and surface as mass 504s).
 */
const UPSTREAM_HEADER_TIMEOUT_MS = 12_000;

/** Browser + Vercel/CDN cache headers (dual CDN keys for platform quirks). */
function cacheHeaders(browser: string, cdn: string): Record<string, string> {
  return {
    "Cache-Control": browser,
    "CDN-Cache-Control": cdn,
    "Vercel-CDN-Cache-Control": cdn,
  };
}

/** Successful image: immutable forever (id never changes content). */
const HIT_CACHE = cacheHeaders(
  "public, max-age=31536000, immutable",
  "public, s-maxage=31536000, immutable"
);

/** Missing cover / not uploaded yet — short negative cache, avoid stampede. */
const MISS_404_CACHE = cacheHeaders(
  "public, max-age=0",
  "public, s-maxage=60, stale-while-revalidate=300"
);

/**
 * Negative cache on gateway / upstream errors. 10s CDN TTL absorbs stampede;
 * browser max-age=0 so clients can revalidate. Manual retry uses ?r= cache-bust
 * and is not blocked by this window.
 */
const ERROR_CACHE = cacheHeaders(
  "public, max-age=0",
  "public, s-maxage=10, stale-while-revalidate=30"
);

/**
 * Proxies upstream images through Vercel Edge + CDN with per-region rate limiting.
 *
 * Rate limit layer (shared with JSON upstream via `rl:upstream`):
 * - 100 req / 5 min per Vercel region (matches upstream limit)
 * - Image MISS + live JSON fetches share the same sliding-window bucket
 * - Each region has its own outbound IP pool, so we limit each separately
 * - On limit exceed: returns 429 with Retry-After header
 * - On Redis failure: fails open (allows request) to prevent outage
 *
 * CDN layer:
 * - First allowed request hits upstream; Vercel CDN caches indefinitely (immutable)
 * - Subsequent requests: x-vercel-cache HIT, no function execution or rate limit check
 * - Hot images serve at CDN latency (~20-50ms globally)
 * - 404 / 502/504 get short negative cache so cold failures do not stampede upstream
 *
 * Timeout: abort only if upstream headers do not arrive in time. Body streaming
 * is uncapped by this timer (platform still enforces Edge wall limits).
 *
 * Always GETs upstream (CF origins often disagree on HEAD vs GET) and strips the
 * body for client HEAD so curl -I / preflight still populate the same cache key.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return proxyImage(request, params, /* includeBody */ true);
}

export async function HEAD(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return proxyImage(request, params, /* includeBody */ false);
}

async function proxyImage(
  request: Request,
  params: Promise<{ id: string }>,
  includeBody: boolean
) {
  const { id } = await params;

  if (!id || !/^\d+$/.test(id)) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  // Per-region rate limit (each Vercel region has its own outbound IP pool)
  const rateLimit = await checkUpstreamRateLimit();

  if (!rateLimit.allowed) {
    // Do not cache 429 — limit window is dynamic.
    return new NextResponse("Rate Limit Exceeded", {
      status: 429,
      headers: rateLimitResponseHeaders(rateLimit.resetMs, rateLimit.limit),
    });
  }

  const referer = request.headers.get("Referer");
  const headers: HeadersInit = { "User-Agent": USER_AGENT };
  if (referer) headers.Referer = referer;

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    UPSTREAM_HEADER_TIMEOUT_MS
  );

  try {
    const res = await fetch(upstreamImageUrl(id), {
      headers,
      signal: controller.signal,
    });
    // Headers received — do not abort the body stream for large/slow images.
    clearTimeout(timer);

    if (res.status === 404) {
      return new NextResponse(null, { status: 404, headers: MISS_404_CACHE });
    }

    if (!res.ok) {
      // 429/403/5xx from upstream — short negative cache, client can retry after.
      return new NextResponse(null, {
        status: res.status,
        headers: ERROR_CACHE,
      });
    }

    const contentType = res.headers.get("Content-Type") || "image/jpeg";

    return new NextResponse(includeBody ? res.body : null, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        ...HIT_CACHE,
      },
    });
  } catch (error) {
    clearTimeout(timer);

    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");

    console.error(
      `[image-proxy] ${id}${timedOut ? " header-timeout" : ""}:`,
      error
    );

    return new NextResponse(timedOut ? "Gateway Timeout" : "Bad Gateway", {
      status: timedOut ? 504 : 502,
      headers: ERROR_CACHE,
    });
  }
}
