export const UPSTREAM_RATE_LIMIT = "RATE_LIMIT";
export const UPSTREAM_FORBIDDEN = "UPSTREAM_FORBIDDEN";

export function getUpstreamError(status: number): Error | null {
  if (status === 429) return new Error(UPSTREAM_RATE_LIMIT);
  if (status === 403) return new Error(UPSTREAM_FORBIDDEN);
  return null;
}

export function getUpstreamHttpStatus(message: string, fallback: number): number {
  if (message === UPSTREAM_RATE_LIMIT) return 429;
  if (message === UPSTREAM_FORBIDDEN) return 403;
  return fallback;
}

export function describeUpstreamError(
  message: string,
  rateLimitMessage: string
): string {
  if (message === UPSTREAM_RATE_LIMIT) return rateLimitMessage;
  if (message === UPSTREAM_FORBIDDEN) return "源站拒绝访问，请稍后再试";
  return message;
}
