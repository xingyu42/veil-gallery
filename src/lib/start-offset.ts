import { randomUUID } from "node:crypto";

import type { GalleryListItem } from "./types";
import { isDisplayableGallery } from "./api";
import {
  locateDenseTail,
  recoverDenseTail,
  type DenseTailReader,
  type DenseTailResult,
  type DenseTailWindow,
} from "./dense-tail-cursor";
import { consumeUpstreamRateLimit } from "./rate-limit";
import { getRedis } from "./redis";
import { USER_AGENT, upstreamUrl } from "./upstream";
import {
  GALLERY_BOUNDARY_UNAVAILABLE,
  getUpstreamError,
  isHardUpstreamFailure,
} from "./upstream-error";

const RECORD_KEY = "gallery:dense-tail:v2:all";
const LOCK_KEY = `${RECORD_KEY}:lock`;
const MEMORY_TTL_MS = 5 * 60 * 1000;
const LOCK_TTL_MS = 180_000;
const SEARCH_BUDGET_MS = 150_000;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_SEARCH_CALLS = 16;
const WINDOW_SIZE = 100;
const LOCAL_MAX_WINDOWS = 4;
const PUBLISH_POLL_MS = 5_000;
const PUBLISH_WAIT_MS = SEARCH_BUDGET_MS + 10_000;
const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

type DenseTailSource = "binary" | "local";

type DenseTailRecord = {
  schema: 2;
  total: number;
  denseCount: number;
  checkedAt: number;
  source: DenseTailSource;
};

type GalleryBoundaryResolution =
  | {
      status: "ready" | "stale";
      offset: number;
      total: number;
      denseCount: number;
      checkedAt: number;
      source: DenseTailSource;
    }
  | {
      status: "env-fallback";
      offset: number;
    }
  | {
      status: "unavailable";
      reason: "no-record" | "refresh-failed";
    };

type SearchContext = {
  readWindow: DenseTailReader;
  callsUsed: () => number;
};

type RefreshOutcome = {
  record: DenseTailRecord | null;
  busy: boolean;
};

type DenseTailRuntimeState = {
  memory: DenseTailRecord | null;
  refreshPromise: Promise<RefreshOutcome> | null;
};

const denseTailGlobal = globalThis as typeof globalThis & {
  __veilGalleryDenseTail?: DenseTailRuntimeState;
};
const runtimeState = (denseTailGlobal.__veilGalleryDenseTail ??= {
  memory: null,
  refreshPromise: null,
});

function envBootstrapOffset(): number | null {
  const raw = process.env.GALLERY_START_OFFSET;
  if (raw == null || raw === "") return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

/** Optional unverified fallback offset from env; null when unset. */
export function getDefaultStartOffset(): number | null {
  return envBootstrapOffset();
}

function isDenseTailRecord(value: unknown): value is DenseTailRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<DenseTailRecord>;
  return (
    record.schema === 2 &&
    Number.isInteger(record.total) &&
    Number(record.total) >= 0 &&
    Number.isInteger(record.denseCount) &&
    Number(record.denseCount) >= 0 &&
    Number(record.denseCount) <= Number(record.total) &&
    typeof record.checkedAt === "number" &&
    Number.isFinite(record.checkedAt) &&
    (record.source === "binary" || record.source === "local")
  );
}

function isFresh(record: DenseTailRecord): boolean {
  return Date.now() - record.checkedAt < MEMORY_TTL_MS;
}

function boundaryFromRecord(
  record: DenseTailRecord,
  status: "ready" | "stale"
): GalleryBoundaryResolution {
  return {
    status,
    offset: record.total - record.denseCount,
    total: record.total,
    denseCount: record.denseCount,
    checkedAt: record.checkedAt,
    source: record.source,
  };
}

async function readRedisRecord(): Promise<DenseTailRecord | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const stored = await redis.get<unknown>(RECORD_KEY);
    if (stored == null) return null;
    if (!isDenseTailRecord(stored)) {
      console.error("[dense-tail] Ignoring invalid Redis record");
      return null;
    }
    runtimeState.memory = stored;
    return stored;
  } catch (error) {
    console.error("[dense-tail] Redis read failed:", error);
    return null;
  }
}

async function readRecord(): Promise<DenseTailRecord | null> {
  if (runtimeState.memory && isFresh(runtimeState.memory)) {
    return runtimeState.memory;
  }
  return (await readRedisRecord()) ?? runtimeState.memory;
}

async function persistRecord(record: DenseTailRecord): Promise<void> {
  runtimeState.memory = record;
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(RECORD_KEY, record);
  } catch (error) {
    console.error("[dense-tail] Redis write failed:", error);
  }
}

function makeRecord(
  result: Extract<DenseTailResult, { status: "found" }>,
  source: DenseTailSource
): DenseTailRecord {
  return {
    schema: 2,
    total: result.total,
    denseCount: result.total - result.startOffset,
    checkedAt: Date.now(),
    source,
  };
}

async function fetchGalleryWindow(
  offset: number,
  limit: number,
  timeoutMs: number
): Promise<DenseTailWindow> {
  await consumeUpstreamRateLimit();
  const res = await fetch(
    upstreamUrl(`/v1/galleries?limit=${limit}&offset=${offset}`),
    {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    }
  );

  if (!res.ok) {
    const upstreamError = getUpstreamError(res.status);
    if (upstreamError) throw upstreamError;
    throw new Error(`API ${res.status}: /v1/galleries`);
  }

  const payload = (await res.json()) as Partial<{
    items: GalleryListItem[];
    total: number;
    offset: number;
  }>;
  if (
    !Array.isArray(payload.items) ||
    !Number.isInteger(payload.total) ||
    Number(payload.total) < 0 ||
    !Number.isInteger(payload.offset)
  ) {
    throw new Error("INVALID_GALLERY_WINDOW");
  }

  return {
    total: Number(payload.total),
    offset: Number(payload.offset),
    items: payload.items.map(isDisplayableGallery),
  };
}

function createSearchContext(): SearchContext {
  const startedAt = Date.now();
  let calls = 0;

  return {
    callsUsed: () => calls,
    readWindow: async (offset, limit) => {
      const remainingMs = SEARCH_BUDGET_MS - (Date.now() - startedAt);
      if (calls >= MAX_SEARCH_CALLS || remainingMs < 1_000) {
        throw new Error("GALLERY_BOUNDARY_SEARCH_BUDGET_EXHAUSTED");
      }
      calls += 1;
      return fetchGalleryWindow(
        offset,
        limit,
        Math.min(FETCH_TIMEOUT_MS, remainingMs)
      );
    },
  };
}

async function readCurrentTotal(context: SearchContext): Promise<number> {
  const head = await context.readWindow(0, 1);
  const expectedItems = Math.min(1, head.total);
  if (head.offset !== 0 || head.items.length !== expectedItems) {
    throw new Error("INVALID_GALLERY_HEAD");
  }
  return head.total;
}

function logSearchFailure(label: string, result: DenseTailResult): void {
  console.error(`[dense-tail] ${label} failed:`, result);
}

async function recoverRecord(
  context: SearchContext,
  knownTotal?: number
): Promise<DenseTailRecord | null> {
  const total = knownTotal ?? (await readCurrentTotal(context));
  const remainingCalls = Math.max(1, MAX_SEARCH_CALLS - context.callsUsed());
  const result = await recoverDenseTail({
    total,
    windowSize: WINDOW_SIZE,
    maxWindows: remainingCalls,
    readWindow: context.readWindow,
  });
  if (result.status !== "found") {
    logSearchFailure("binary recovery", result);
    return null;
  }
  return makeRecord(result, "binary");
}

async function refreshRecord(
  cached: DenseTailRecord | null,
  forceRecovery: boolean
): Promise<DenseTailRecord | null> {
  const context = createSearchContext();
  let next: DenseTailRecord | null = null;

  if (cached && !forceRecovery) {
    const total = await readCurrentTotal(context);
    const local = await locateDenseTail({
      total,
      cachedDenseCount: cached.denseCount,
      windowSize: WINDOW_SIZE,
      maxWindows: LOCAL_MAX_WINDOWS,
      readWindow: context.readWindow,
    });

    if (local.status === "found") {
      next = makeRecord(local, "local");
    } else if (local.status === "exhausted") {
      next = await recoverRecord(context, total);
    } else if (local.status === "stale") {
      // Local probe already consumed one call reading the current total.
      next = await recoverRecord(context, total);
    } else {
      logSearchFailure("local correction", local);
    }
  } else {
    next = await recoverRecord(context);
  }

  if (next) await persistRecord(next);
  return next;
}

async function releaseLock(token: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.eval(RELEASE_LOCK_SCRIPT, [LOCK_KEY], [token]);
  } catch (error) {
    console.error("[dense-tail] Redis lock release failed:", error);
  }
}

async function runRefreshSingleFlight(
  cached: DenseTailRecord | null,
  forceRecovery: boolean
): Promise<RefreshOutcome> {
  if (runtimeState.refreshPromise) return runtimeState.refreshPromise;

  runtimeState.refreshPromise = (async () => {
    const redis = getRedis();
    if (!redis) {
      return {
        record: await refreshRecord(cached, forceRecovery),
        busy: false,
      };
    }

    const token = randomUUID();
    let acquired = false;
    try {
      acquired =
        (await redis.set(LOCK_KEY, token, {
          nx: true,
          px: LOCK_TTL_MS,
        })) === "OK";
    } catch (error) {
      console.error("[dense-tail] Redis lock acquisition failed:", error);
      return {
        record: await refreshRecord(cached, forceRecovery),
        busy: false,
      };
    }

    if (!acquired) return { record: null, busy: true };
    try {
      return {
        record: await refreshRecord(cached, forceRecovery),
        busy: false,
      };
    } finally {
      await releaseLock(token);
    }
  })();

  try {
    return await runtimeState.refreshPromise;
  } catch (error) {
    if (isHardUpstreamFailure(error)) throw error;
    console.error("[dense-tail] Refresh failed:", error);
    return { record: null, busy: false };
  } finally {
    runtimeState.refreshPromise = null;
  }
}

async function waitForPublishedRecord(): Promise<DenseTailRecord | null> {
  const redis = getRedis();
  if (!redis) return null;
  const deadline = Date.now() + PUBLISH_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, PUBLISH_POLL_MS));
    const record = await readRedisRecord();
    if (record) return record;
    try {
      if ((await redis.get<string>(LOCK_KEY)) == null) return null;
    } catch (error) {
      console.error("[dense-tail] Redis lock poll failed:", error);
      return null;
    }
  }
  return null;
}

export async function resolveGalleryBoundary(options?: {
  forceRecovery?: boolean;
}): Promise<GalleryBoundaryResolution> {
  const forceRecovery = options?.forceRecovery === true;
  const cached = await readRecord();

  if (cached && !forceRecovery && isFresh(cached)) {
    return boundaryFromRecord(cached, "ready");
  }

  let outcome: RefreshOutcome;
  try {
    outcome = await runRefreshSingleFlight(cached, forceRecovery);
  } catch (error) {
    if (cached && !forceRecovery) {
      return boundaryFromRecord(cached, "stale");
    }
    throw error;
  }

  if (outcome.record) return boundaryFromRecord(outcome.record, "ready");
  if (cached) return boundaryFromRecord(cached, "stale");

  if (outcome.busy) {
    const published = await waitForPublishedRecord();
    if (published) {
      return boundaryFromRecord(
        published,
        isFresh(published) ? "ready" : "stale"
      );
    }
  }

  const bootstrap = envBootstrapOffset();
  if (bootstrap != null) {
    return { status: "env-fallback", offset: bootstrap };
  }

  return {
    status: "unavailable",
    reason: forceRecovery ? "refresh-failed" : "no-record",
  };
}

/**
 * Boundary offset for server pages: any usable variant resolves to its offset;
 * only a hard "unavailable" throws (mapped to 503 copy via upstream-error).
 */
export async function resolveGalleryBoundaryOffset(): Promise<number> {
  const boundary = await resolveGalleryBoundary();
  if (boundary.status === "unavailable") {
    throw new Error(GALLERY_BOUNDARY_UNAVAILABLE);
  }
  return boundary.offset;
}
