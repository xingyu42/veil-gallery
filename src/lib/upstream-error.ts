import { NextResponse } from "next/server";

export const UPSTREAM_RATE_LIMIT = "RATE_LIMIT";
export const UPSTREAM_FORBIDDEN = "UPSTREAM_FORBIDDEN";

export function getUpstreamError(status: number): Error | null {
  if (status === 429) return new Error(UPSTREAM_RATE_LIMIT);
  if (status === 403) return new Error(UPSTREAM_FORBIDDEN);
  return null;
}

export function getErrorMessage(error: unknown, fallback = "error"): string {
  return error instanceof Error ? error.message : fallback;
}

export function getUpstreamHttpStatus(message: string, fallback: number): number {
  if (message === UPSTREAM_RATE_LIMIT) return 429;
  if (message === UPSTREAM_FORBIDDEN) return 403;
  return fallback;
}

export function describeUpstreamError(
  message: string,
  rateLimitMessage: string,
  forbiddenMessage = "源站拒绝访问，请稍后再试"
): string {
  if (message === UPSTREAM_RATE_LIMIT) return rateLimitMessage;
  if (message === UPSTREAM_FORBIDDEN) return forbiddenMessage;
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
  return NextResponse.json(
    { error: message, ...extra },
    { status: getUpstreamHttpStatus(message, fallbackStatus) }
  );
}
