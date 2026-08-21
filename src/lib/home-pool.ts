import { randomUUID } from "node:crypto";

import type { GalleryListItem, Paginated } from "./types";
import { apiFetch, isDisplayableGallery } from "./api";
import { getRedis } from "./redis";
import { resolveGalleryBoundary } from "./start-offset";
import {
  GALLERY_BOUNDARY_UNAVAILABLE,
  getErrorMessage,
  getRateLimitResetMs,
  isHardUpstreamFailure,
} from "./upstream-error";

/**
 * Homepage random pool: one list fetch at a random offset inside the dense
 * tail (skipping a small edge band), filtered by isDisplayableGallery and
 * shared via Redis so per-visitor randomness costs zero upstream quota.
 * Rebuilt after TTL outside the page response. A bounded stale record remains
 * renderable while refresh runs or the upstream is temporarily unavailable.
 */

const RECORD_KEY = "home:random-pool:v1";
const LOCK_KEY = `${RECORD_KEY}:lock`;
const FAIL_KEY = `${RECORD_KEY}:fail`;
const LOCK_TTL_MS = 180_000;
const BUILD_WAIT_MS = 30_000;
const BUILD_POLL_MS = 2_000;
const FAIL_KEY_DEFAULT_TTL_MS = 60_000;
/** Keep a bounded stale pool available while refresh happens off the request path. */
const RECORD_TTL_SLACK_MS = 86_400_000;
/** Minimum renderable items required to publish a pool. */
const MIN_POOL_ITEMS = 8;
/** Dense-tail edge band skipped when sampling (half-uploaded items cluster here). */
const EDGE_SKIP = 10;
/** High dense-tail offsets answer in ~10-13s; allow headroom beyond getGalleries' 12s. */
const BUILD_FETCH_TIMEOUT_MS = 20_000;

const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

type HomePoolRecord = {
  builtAt: number;
  items: GalleryListItem[];
};

type HomePoolRuntimeState = {
  memory: HomePoolRecord | null;
  buildPromise: Promise<HomePoolRecord | null> | null;
  failure: HomePoolFailureRecord | null;
};

type HomePoolFailureRecord = {
  message: string;
  until: number;
  retryAfterSeconds: number;
};

export type HomePoolSnapshot =
  | { status: "fresh" | "stale"; items: GalleryListItem[] }
  | { status: "missing"; items: [] }
  | {
      status: "failed";
      items: [];
      error: string;
      retryAfterSeconds: number;
    };

const homePoolGlobal = globalThis as typeof globalThis & {
  __veilGalleryHomePool?: HomePoolRuntimeState;
};
const runtimeState = (homePoolGlobal.__veilGalleryHomePool ??= {
  memory: null,
  buildPromise: null,
  failure: null,
});
// Preserve compatibility with a runtime state created before this field existed.
runtimeState.failure ??= null;

/** Env is fixed for the process lifetime — parse once. */
const POOL_SIZE = (() => {
  const raw = process.env.HOME_RANDOM_POOL_SIZE;
  const value = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(value) && value >= MIN_POOL_ITEMS ? value : 96;
})();

const POOL_TTL_MS = (() => {
  const raw = process.env.HOME_RANDOM_POOL_TTL_SECONDS;
  const value = raw ? Number.parseInt(raw, 10) : NaN;
  const seconds = Number.isInteger(value) && value >= 60 ? value : 1800;
  return seconds * 1000;
})();

function isFresh(record: HomePoolRecord): boolean {
  return Date.now() - record.builtAt < POOL_TTL_MS;
}

function isRetained(record: HomePoolRecord): boolean {
  return Date.now() - record.builtAt < POOL_TTL_MS + RECORD_TTL_SLACK_MS;
}

function isHomePoolRecord(value: unknown): value is HomePoolRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<HomePoolRecord>;
  return (
    typeof record.builtAt === "number" &&
    Number.isFinite(record.builtAt) &&
    Array.isArray(record.items) &&
    record.items.length >= MIN_POOL_ITEMS
  );
}

async function readRedisRecord(): Promise<HomePoolRecord | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const stored = await redis.get<unknown>(RECORD_KEY);
    if (stored == null) return null;
    if (!isHomePoolRecord(stored)) {
      console.error("[home-pool] Ignoring invalid Redis record");
      return null;
    }
    runtimeState.memory = stored;
    return stored;
  } catch (error) {
    console.error("[home-pool] Redis read failed:", error);
    return null;
  }
}

async function persistRecord(record: HomePoolRecord): Promise<void> {
  runtimeState.memory = record;
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(RECORD_KEY, record, {
      px: POOL_TTL_MS + RECORD_TTL_SLACK_MS,
    });
  } catch (error) {
    console.error("[home-pool] Redis write failed:", error);
  }
}

function isFailureRecord(value: unknown): value is HomePoolFailureRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<HomePoolFailureRecord>;
  return (
    typeof record.message === "string" &&
    Number.isFinite(record.until) &&
    Number.isFinite(record.retryAfterSeconds)
  );
}

async function markFailure(error: unknown, ttlMs: number): Promise<void> {
  const safeTtlMs = Math.max(1_000, ttlMs);
  const failure: HomePoolFailureRecord = {
    message: getErrorMessage(error, "HOME_POOL_BUILD_RECENTLY_FAILED"),
    until: Date.now() + safeTtlMs,
    retryAfterSeconds: Math.max(1, Math.ceil(safeTtlMs / 1_000)),
  };
  runtimeState.failure = failure;
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(FAIL_KEY, failure, { px: safeTtlMs });
  } catch (error) {
    console.error("[home-pool] Redis fail-mark write failed:", error);
  }
}

async function readRecentFailure(): Promise<HomePoolFailureRecord | null> {
  if (runtimeState.failure && runtimeState.failure.until > Date.now()) {
    return runtimeState.failure;
  }
  runtimeState.failure = null;
  const redis = getRedis();
  if (!redis) return null;
  try {
    const stored = await redis.get<unknown>(FAIL_KEY);
    if (stored == null) return null;
    if (isFailureRecord(stored) && stored.until > Date.now()) {
      runtimeState.failure = stored;
      return stored;
    }
    // Backward compatibility for the previous numeric fail marker.
    return {
      message: "HOME_POOL_BUILD_RECENTLY_FAILED",
      until: Date.now() + 1_000,
      retryAfterSeconds: 1,
    };
  } catch (error) {
    console.error("[home-pool] Redis fail-mark read failed:", error);
    return null;
  }
}

/** Random window offset inside the dense tail, skipping the edge band. */
function sampleOffset(boundary: number, denseCount: number): number {
  const size = POOL_SIZE;
  const low = boundary + Math.min(EDGE_SKIP, Math.max(0, denseCount - size));
  const high = boundary + Math.max(0, denseCount - size);
  if (high <= low) return Math.max(0, boundary);
  return low + Math.floor(Math.random() * (high - low + 1));
}

async function resolveDenseRange(): Promise<{
  boundary: number;
  denseCount: number;
}> {
  const boundary = await resolveGalleryBoundary();
  if (boundary.status === "ready" || boundary.status === "stale") {
    return { boundary: boundary.offset, denseCount: boundary.denseCount };
  }
  if (boundary.status === "env-fallback") {
    // Only an offset is known; one head probe recovers total for the length.
    const head = await apiFetch<{ total?: number }>(
      "/v1/galleries?limit=1&offset=0",
      0
    );
    const total = Number(head.total);
    if (!Number.isInteger(total) || total < boundary.offset) {
      throw new Error("HOME_POOL_INVALID_TOTAL");
    }
    return { boundary: boundary.offset, denseCount: total - boundary.offset };
  }
  throw new Error(GALLERY_BOUNDARY_UNAVAILABLE);
}

async function buildPool(): Promise<HomePoolRecord> {
  const { boundary, denseCount } = await resolveDenseRange();
  const offset = sampleOffset(boundary, denseCount);

  // Single list fetch: dense-tail items are all displayable (measured 576/576
  // clean), so one window yields a full pool without per-id detail calls.
  const page = await apiFetch<Paginated<GalleryListItem>>(
    `/v1/galleries?limit=${POOL_SIZE}&offset=${offset}`,
    0,
    { timeoutMs: BUILD_FETCH_TIMEOUT_MS }
  );

  const items = (page.items || []).filter(isDisplayableGallery);
  if (items.length < MIN_POOL_ITEMS) {
    throw new Error("HOME_POOL_TOO_FEW_ITEMS");
  }

  const record: HomePoolRecord = { builtAt: Date.now(), items };
  await persistRecord(record);
  return record;
}

async function releaseLock(token: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.eval(RELEASE_LOCK_SCRIPT, [LOCK_KEY], [token]);
  } catch (error) {
    console.error("[home-pool] Redis lock release failed:", error);
  }
}

function failTtlMs(error: unknown): number {
  const resetMs = getRateLimitResetMs(error);
  if (resetMs > 0) return Math.min(resetMs, 300_000);
  return FAIL_KEY_DEFAULT_TTL_MS;
}

/** Wait for another instance's builder to publish a fresh record. */
async function waitForPublishedRecord(): Promise<HomePoolRecord | null> {
  const redis = getRedis();
  if (!redis) return null;

  const deadline = Date.now() + BUILD_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, BUILD_POLL_MS));
    const record = await readRedisRecord();
    if (record && isFresh(record)) return record;
    // Lock gone without a fresh publish → peer failed; stop waiting.
    try {
      if ((await redis.get<string>(LOCK_KEY)) == null) return null;
    } catch (error) {
      console.error("[home-pool] Redis lock poll failed:", error);
      return null;
    }
  }
  return null;
}

async function runBuildSingleFlight(): Promise<HomePoolRecord | null> {
  if (runtimeState.buildPromise) return runtimeState.buildPromise;

  runtimeState.buildPromise = (async () => {
    const redis = getRedis();
    if (!redis) {
      return buildPool();
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
      console.error("[home-pool] Redis lock acquisition failed:", error);
      return buildPool();
    }

    if (!acquired) {
      return waitForPublishedRecord();
    }

    try {
      return await buildPool();
    } finally {
      await releaseLock(token);
    }
  })();

  try {
    return await runtimeState.buildPromise;
  } catch (error) {
    void markFailure(error, failTtlMs(error));
    if (isHardUpstreamFailure(error)) throw error;
    console.error("[home-pool] Build failed:", error);
    return null;
  } finally {
    runtimeState.buildPromise = null;
  }
}

/** Read-only request path: never waits for upstream pool construction. */
export async function getHomePoolSnapshot(): Promise<HomePoolSnapshot> {
  let retainedMemory: HomePoolRecord | null = null;
  if (runtimeState.memory) {
    if (isFresh(runtimeState.memory)) {
      return { status: "fresh", items: runtimeState.memory.items };
    }
    if (isRetained(runtimeState.memory)) {
      retainedMemory = runtimeState.memory;
    } else {
      runtimeState.memory = null;
    }
  }

  // A peer may have published a newer pool, so Redis remains authoritative even
  // when this process still has a stale record.
  const [cached, recentFailure] = await Promise.all([
    readRedisRecord(),
    readRecentFailure(),
  ]);
  const available = cached && isRetained(cached) ? cached : retainedMemory;
  if (available) {
    return {
      status: isFresh(available) ? "fresh" : "stale",
      items: available.items,
    };
  }
  if (recentFailure) {
    return {
      status: "failed",
      items: [],
      error: recentFailure.message,
      retryAfterSeconds: recentFailure.retryAfterSeconds,
    };
  }
  return { status: "missing", items: [] };
}

/** Build or refresh the shared pool, respecting the existing failure backoff. */
export async function refreshHomePool(): Promise<boolean> {
  if (await readRecentFailure()) return false;
  return (await runBuildSingleFlight()) !== null;
}
