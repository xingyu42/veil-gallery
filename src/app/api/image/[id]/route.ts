import { NextResponse } from "next/server";
import { checkUpstreamRateLimit } from "@/lib/rate-limit";
import { USER_AGENT, upstreamImageUrl } from "@/lib/upstream";

export const runtime = "edge";

/**
 * Proxies upstream images through Vercel Edge + CDN with per-region rate limiting.
 *
 * Rate limit layer (Upstash Redis sliding window):
 * - 100 req / 5 min per Vercel Edge region (matches upstream limit)
 * - Each region has its own outbound IP pool, so we limit each separately
 * - On limit exceed: returns 429 with Retry-After header
 * - On Redis failure: fails open (allows request) to prevent outage
 *
 * CDN layer:
 * - First allowed request hits upstream; Vercel CDN caches indefinitely (immutable)
 * - Subsequent requests: x-vercel-cache HIT, no function execution or rate limit check
 * - Hot images serve at CDN latency (~20-50ms globally)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Per-region rate limit (each Vercel region has its own outbound IP pool)
  const region = process.env.VERCEL_REGION || "dev";
  const rateLimit = await checkUpstreamRateLimit(region);

  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil(rateLimit.resetMs / 1000);
    return new NextResponse("Rate Limit Exceeded", {
      status: 429,
      headers: {
        "Retry-After": retryAfter.toString(),
        "X-RateLimit-Limit": rateLimit.limit.toString(),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": Math.ceil(
          (Date.now() + rateLimit.resetMs) / 1000
        ).toString(),
      },
    });
  }

  const referer = request.headers.get("Referer");
  const headers: HeadersInit = { "User-Agent": USER_AGENT };
  if (referer) headers.Referer = referer;

  try {
    const res = await fetch(upstreamImageUrl(id), { headers });

    if (!res.ok) {
      // 404 is normal (covers not uploaded yet); 429/403 less so but possible.
      return new NextResponse(null, { status: res.status });
    }

    const contentType = res.headers.get("Content-Type") || "image/jpeg";

    return new NextResponse(res.body, {
      headers: {
        "Content-Type": contentType,
        // Browser: cache forever, the ID never changes.
        "Cache-Control": "public, max-age=31536000, immutable",
        // Vercel CDN: same. Hot images become pure CDN after the first MISS.
        "CDN-Cache-Control": "public, s-maxage=31536000",
      },
    });
  } catch (error) {
    // Network failure or upstream timeout — return 502 so the client can retry.
    console.error(`[image-proxy] ${id}:`, error);
    return new NextResponse("Bad Gateway", { status: 502 });
  }
}
