import { upstreamImageUrl } from "./upstream";

const MAX_RESIN_ATTEMPTS = 3;
const HEADER_TIMEOUT_MS = 12_000;

export interface ImageAttemptLimit {
  allowed: boolean;
  limit: number;
  resetMs: number;
}

export interface ImageUpstreamTarget {
  resinEnabled: boolean;
  url: string;
}

export type ImageUpstreamResult =
  | { kind: "response"; response: Response; attempts: number }
  | { kind: "local-rate-limit"; rateLimit: ImageAttemptLimit; attempts: number };

interface FetchImageOptions {
  target: ImageUpstreamTarget;
  headers: HeadersInit;
  beforeAttempt: () => Promise<ImageAttemptLimit>;
  fetchImpl?: typeof fetch;
  headerTimeoutMs?: number;
}

export class ImageUpstreamFetchError extends Error {
  readonly attempts: number;
  readonly timedOut: boolean;

  constructor(attempts: number, timedOut: boolean) {
    super(timedOut ? "image upstream header timeout" : "image upstream fetch failed");
    this.name = "ImageUpstreamFetchError";
    this.attempts = attempts;
    this.timedOut = timedOut;
  }
}

export function resolveImageUpstreamTarget(
  id: string,
  resinBaseUrl = process.env.RESIN_IMAGE_PROXY_BASE_URL
): ImageUpstreamTarget {
  const baseUrl = resinBaseUrl?.trim();
  if (!baseUrl) {
    return { resinEnabled: false, url: upstreamImageUrl(id) };
  }

  // WHATWG URL clients remove `/./`; Resin's equivalent `:` identity segment
  // also means default platform + empty account and survives normalization.
  const normalizedBaseUrl = baseUrl.replace(/\/\.\/(?=https?\/)/, "/:/");
  const parsed = new URL(normalizedBaseUrl);
  if (parsed.protocol !== "https:") {
    throw new Error("RESIN_IMAGE_PROXY_BASE_URL must use HTTPS");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("RESIN_IMAGE_PROXY_BASE_URL must not contain query or hash");
  }

  return {
    resinEnabled: true,
    url: `${normalizedBaseUrl.replace(/\/+$/, "")}/v1/image/${id}`,
  };
}

function isRotationStatus(status: number): boolean {
  return status === 429 || status === 403 || status === 502 || status === 504;
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // A closed response body needs no further cleanup.
  }
}

export async function fetchImageUpstream({
  target,
  headers,
  beforeAttempt,
  fetchImpl = fetch,
  headerTimeoutMs = HEADER_TIMEOUT_MS,
}: FetchImageOptions): Promise<ImageUpstreamResult> {
  const maxAttempts = target.resinEnabled ? MAX_RESIN_ATTEMPTS : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const rateLimit = await beforeAttempt();
    if (!rateLimit.allowed) {
      return { kind: "local-rate-limit", rateLimit, attempts: attempt - 1 };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), headerTimeoutMs);

    let response: Response;
    try {
      response = await fetchImpl(target.url, {
        headers,
        signal: controller.signal,
        ...(target.resinEnabled ? { cache: "no-store" as const } : {}),
      });
      clearTimeout(timer);
    } catch (error) {
      clearTimeout(timer);
      if (target.resinEnabled && attempt < maxAttempts) {
        continue;
      }
      throw new ImageUpstreamFetchError(attempt, isTimeoutError(error));
    }

    if (
      target.resinEnabled &&
      isRotationStatus(response.status) &&
      attempt < maxAttempts
    ) {
      await cancelResponseBody(response);
      continue;
    }

    return { kind: "response", response, attempts: attempt };
  }

  throw new ImageUpstreamFetchError(maxAttempts, false);
}
