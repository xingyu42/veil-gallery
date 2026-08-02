import { getRedis } from "./redis";
import { USER_AGENT, upstreamUrl } from "./upstream";
import { getUpstreamError } from "./upstream-error";

/**
 * startOffset: upstream /v1/galleries offset where uploaded covers become common.
 *
 * Source of truth (in order):
 * 1. process memory (warm instance)
 * 2. Upstash Redis (cross-instance, set by /api/calibrate-offset)
 * 3. GALLERY_START_OFFSET env (optional bootstrap)
 * 4. 0 — scan from the head; getGalleries() already skips empty batches
 *
 * Hardcoded 75797 was a one-shot measurement and drifts; do not treat it as truth.
 */

const REDIS_KEY = "gallery:start_offset";
const MEMORY_TTL_MS = 6 * 60 * 60 * 1000; // 6h

type OffsetRecord = {
  offset: number;
  total: number;
  checkedAt: number;
};

let memory: OffsetRecord | null = null;

function envBootstrapOffset(): number | null {
  const raw = process.env.GALLERY_START_OFFSET;
  if (raw == null || raw === "") return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function isFresh(record: OffsetRecord): boolean {
  return Date.now() - record.checkedAt < MEMORY_TTL_MS;
}

/**
 * Resolve the gallery list start offset.
 * Prefer Redis over any baked-in constant.
 */
export async function getStartOffset(): Promise<number> {
  if (memory && isFresh(memory)) {
    return memory.offset;
  }

  const redis = getRedis();
  if (redis) {
    try {
      const stored = await redis.get<OffsetRecord | number>(REDIS_KEY);
      if (stored != null) {
        const record: OffsetRecord =
          typeof stored === "number"
            ? { offset: stored, total: 0, checkedAt: Date.now() }
            : stored;
        if (
          typeof record.offset === "number" &&
          Number.isFinite(record.offset) &&
          record.offset >= 0
        ) {
          memory = {
            offset: Math.floor(record.offset),
            total: record.total ?? 0,
            checkedAt: record.checkedAt ?? Date.now(),
          };
          return memory.offset;
        }
      }
    } catch (error) {
      console.error("[start-offset] Redis read failed:", error);
    }
  }

  if (memory) return memory.offset;

  const bootstrap = envBootstrapOffset();
  if (bootstrap != null) return bootstrap;

  // No calibrated value yet — start at head; sparse scan fills pages.
  return 0;
}

/** @deprecated use getStartOffset() */
export function getCachedStartOffset(): number {
  if (memory && isFresh(memory)) return memory.offset;
  if (memory) return memory.offset;
  return envBootstrapOffset() ?? 0;
}

export async function setStartOffset(offset: number, total: number) {
  const record: OffsetRecord = {
    offset: Math.max(0, Math.floor(offset)),
    total: Math.max(0, Math.floor(total)),
    checkedAt: Date.now(),
  };
  memory = record;

  const redis = getRedis();
  if (!redis) return;

  try {
    // No TTL: calibration cron refreshes; missing key means "uncalibrated".
    await redis.set(REDIS_KEY, record);
  } catch (error) {
    console.error("[start-offset] Redis write failed:", error);
  }
}

/** @deprecated use setStartOffset */
export function setCachedStartOffset(offset: number, total: number) {
  memory = {
    offset: Math.max(0, Math.floor(offset)),
    total: Math.max(0, Math.floor(total)),
    checkedAt: Date.now(),
  };
  void setStartOffset(offset, total);
}

export function getDefaultStartOffset() {
  return envBootstrapOffset() ?? 0;
}

async function fetchPage(offset: number, limit: number) {
  const res = await fetch(
    upstreamUrl(`/v1/galleries?limit=${limit}&offset=${offset}`),
    {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      cache: "no-store",
    }
  );
  if (!res.ok) {
    const upstreamError = getUpstreamError(res.status);
    if (upstreamError) throw upstreamError;
    throw new Error(`API ${res.status}`);
  }
  return res.json() as Promise<{
    items: { id: number; uploaded_images?: number }[];
    total: number;
  }>;
}

function pageRatio(items: { uploaded_images?: number }[]) {
  if (!items.length) return 0;
  const good = items.filter((g) => (g.uploaded_images ?? 0) > 0).length;
  return good / items.length;
}

/**
 * Exponential + binary probe. Expensive (~15–30 calls) — cron / manual only.
 */
export async function probeStartOffset(threshold = 0.5): Promise<{
  startOffset: number;
  total: number;
  calls: number;
}> {
  let calls = 0;
  const limit = 10;

  const sample = async (offset: number) => {
    calls += 1;
    const d = await fetchPage(offset, limit);
    return { total: d.total, ratio: pageRatio(d.items || []) };
  };

  const first = await sample(0);
  const total = first.total;

  let found: number | null = null;
  if (first.ratio >= threshold) {
    found = 0;
  } else {
    let hi = 0;
    let step = 1000;
    while (hi < total && calls < 20) {
      const cand = Math.min(hi + step, Math.max(0, total - limit));
      if (cand === hi) break;
      const s = await sample(cand);
      if (s.ratio >= threshold) {
        found = cand;
        break;
      }
      hi = cand;
      step = Math.min(step * 2, 25000);
    }
  }

  if (found === null) {
    return { startOffset: await getStartOffset(), total, calls };
  }

  let lo = 0;
  let best = found;
  while (lo + 20 < best && calls < 35) {
    const mid = Math.floor((lo + best) / 2);
    const s = await sample(mid);
    if (s.ratio >= threshold) best = mid;
    else lo = mid;
  }

  const c1 = await sample(best);
  const c2 = await sample(best + limit);
  if (c1.ratio < threshold || c2.ratio < threshold) {
    best = Math.min(best + limit * 2, Math.max(0, total - limit));
  }

  await setStartOffset(best, total);
  return { startOffset: best, total, calls };
}
