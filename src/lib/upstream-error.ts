import { NextResponse } from "next/server";

export const UPSTREAM_RATE_LIMIT = "RATE_LIMIT";
export const UPSTREAM_FORBIDDEN = "UPSTREAM_FORBIDDEN";
export const GALLERY_BOUNDARY_UNAVAILABLE = "GALLERY_BOUNDARY_UNAVAILABLE";

/** Shared copy for tag-preview 429 UI (server page + client reshuffle). */
export const TAG_PREVIEW_RATE_LIMIT_MESSAGE =
  "标签预览接口限流（约 60 次/5 分钟），请稍后再试";

/** Thrown when our per-region quota is exhausted (before upstream is contacted). */
export class UpstreamRateLimitError extends Error {
  readonly resetMs: number;

  constructor(resetMs = 0) {
    super(UPSTREAM_RATE_LIMIT);
    this.name = "UpstreamRateLimitError";
    this.resetMs = Math.max(0, resetMs);
  }
}

export function getUpstreamError(status: number): Error | null {
  if (status === 429) return new UpstreamRateLimitError(0);
  if (status === 403) return new Error(UPSTREAM_FORBIDDEN);
  return null;
}

export function getErrorMessage(error: unknown, fallback = "error"): string {
  return error instanceof Error ? error.message : fallback;
}

export function isUpstreamRateLimitError(
  error: unknown
): error is UpstreamRateLimitError {
  return (
    error instanceof UpstreamRateLimitError ||
    (error instanceof Error && error.message === UPSTREAM_RATE_LIMIT)
  );
}

export function getRateLimitResetMs(error: unknown): number {
  if (error instanceof UpstreamRateLimitError) return error.resetMs;
  return 0;
}

/** Standard Retry-After + X-RateLimit-* headers for 429 responses. */
export function rateLimitResponseHeaders(
  resetMs: number,
  limit = 100
): Record<string, string> {
  const safeMs = Math.max(0, resetMs);
  return {
    "Retry-After": String(Math.max(1, Math.ceil(safeMs / 1000))),
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": "0",
    "X-RateLimit-Reset": String(Math.ceil((Date.now() + safeMs) / 1000)),
  };
}

export function getUpstreamHttpStatus(message: string, fallback: number): number {
  if (message === UPSTREAM_RATE_LIMIT) return 429;
  if (message === UPSTREAM_FORBIDDEN) return 403;
  if (message === GALLERY_BOUNDARY_UNAVAILABLE) return 503;
  return fallback;
}

export function describeUpstreamError(
  message: string,
  rateLimitMessage: string,
  forbiddenMessage = "源站拒绝访问，请稍后再试"
): string {
  if (message === UPSTREAM_RATE_LIMIT) return rateLimitMessage;
  if (message === UPSTREAM_FORBIDDEN) return forbiddenMessage;
  if (message === GALLERY_BOUNDARY_UNAVAILABLE) {
    return "图集索引暂时不可用，请稍后重试";
  }
  return message;
}

/** JSON error response with upstream-aware status mapping. */
export function upstreamJsonError(
  error: unknown,
  fallbackStatus = 500,
  fallbackMessage = "error",
  extra?: Record<string, unknown>
): NextResponse {
  const message = getErrorMessage(error, fallbackMessage);
  const headers =
    message === UPSTREAM_RATE_LIMIT
      ? rateLimitResponseHeaders(getRateLimitResetMs(error))
      : undefined;

  return NextResponse.json(
    { error: message, ...extra },
    { status: getUpstreamHttpStatus(message, fallbackStatus), headers }
  );
}
