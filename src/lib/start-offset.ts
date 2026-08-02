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

/** Leave headroom under Vercel maxDuration=60 on calibrate-offset. */
const PROBE_BUDGET_MS = 45_000;
const PROBE_FETCH_TIMEOUT_MS = 3_500;
const PROBE_MAX_CALLS = 14;
const PROBE_SAMPLE_LIMIT = 10;
const EXP_INITIAL_STEP = 5_000;
const EXP_MAX_STEP = 50_000;
const BINARY_STOP_GAP = 200;
const PROBE_MAX_FAILURES = 3;

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
      signal: AbortSignal.timeout(PROBE_FETCH_TIMEOUT_MS),
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

export type ProbeResult = {
  startOffset: number;
  total: number;
  calls: number;
  partial: boolean;
  timedOut: boolean;
  elapsedMs: number;
};

/**
 * Budgeted exponential + coarse binary probe.
 * Early-writes the first dense candidate so a mid-run timeout still leaves Redis warm.
 * Expensive — cron / manual only. Never writes 0 just because the probe failed.
 */
export async function probeStartOffset(threshold = 0.5): Promise<ProbeResult> {
  const started = Date.now();
  let calls = 0;
  let failures = 0;
  let best: number | null = null;
  let total = 0;
  let partial = false;
  let timedOut = false;
  let earlyWritten = false;

  const elapsed = () => Date.now() - started;

  const withinBudget = () =>
    elapsed() < PROBE_BUDGET_MS &&
    calls < PROBE_MAX_CALLS &&
    failures < PROBE_MAX_FAILURES;

  const sample = async (
    offset: number
  ): Promise<{ total: number; ratio: number } | null> => {
    if (!withinBudget()) {
      timedOut = elapsed() >= PROBE_BUDGET_MS || calls >= PROBE_MAX_CALLS;
      return null;
    }
    calls += 1;
    try {
      const d = await fetchPage(offset, PROBE_SAMPLE_LIMIT);
      return { total: d.total, ratio: pageRatio(d.items || []) };
    } catch (error) {
      failures += 1;
      console.error("[start-offset] probe sample failed:", error);
      if (failures >= PROBE_MAX_FAILURES) {
        timedOut = true;
      }
      return null;
    }
  };

  const persistBest = async (offset: number, tot: number) => {
    await setStartOffset(offset, tot);
  };

  const first = await sample(0);
  if (!first) {
    return {
      startOffset: await getStartOffset(),
      total,
      calls,
      partial: false,
      timedOut: true,
      elapsedMs: elapsed(),
    };
  }

  total = first.total;

  if (first.ratio >= threshold) {
    best = 0;
    await persistBest(best, total);
    earlyWritten = true;
  } else {
    let hi = 0;
    let step = EXP_INITIAL_STEP;
    while (hi < total && withinBudget()) {
      const cand = Math.min(hi + step, Math.max(0, total - PROBE_SAMPLE_LIMIT));
      if (cand === hi) break;
      const s = await sample(cand);
      if (!s) break;
      if (s.ratio >= threshold) {
        best = cand;
        // Early write: survive budget/timeout after first dense hit.
        await persistBest(best, total);
        earlyWritten = true;
        break;
      }
      hi = cand;
      step = Math.min(step * 2, EXP_MAX_STEP);
    }
  }

  if (best === null) {
    // Do not clobber Redis with 0 when no dense region was found.
    return {
      startOffset: await getStartOffset(),
      total,
      calls,
      partial: false,
      timedOut:
        timedOut ||
        elapsed() >= PROBE_BUDGET_MS ||
        calls >= PROBE_MAX_CALLS ||
        failures >= PROBE_MAX_FAILURES,
      elapsedMs: elapsed(),
    };
  }

  // Coarse binary refine toward the density boundary.
  let lo = 0;
  while (lo + BINARY_STOP_GAP < best && withinBudget()) {
    const mid = Math.floor((lo + best) / 2);
    const s = await sample(mid);
    if (!s) {
      partial = true;
      break;
    }
    if (s.ratio >= threshold) best = mid;
    else lo = mid;
  }

  if (!withinBudget()) {
    partial = true;
    timedOut =
      timedOut ||
      elapsed() >= PROBE_BUDGET_MS ||
      calls >= PROBE_MAX_CALLS ||
      failures >= PROBE_MAX_FAILURES;
  }

  // Optional confirm when budget remains.
  if (withinBudget()) {
    const c1 = await sample(best);
    if (c1 && withinBudget()) {
      const c2 = await sample(best + PROBE_SAMPLE_LIMIT);
      if (
        (c1 && c1.ratio < threshold) ||
        (c2 && c2.ratio < threshold)
      ) {
        best = Math.min(best + PROBE_SAMPLE_LIMIT * 2, Math.max(0, total - PROBE_SAMPLE_LIMIT));
      }
    } else {
      partial = true;
    }
  } else {
    partial = true;
  }

  // Final write (may equal early write; refreshes checkedAt).
  await persistBest(best, total);

  // Early write without full refine counts as partial.
  if (earlyWritten && partial === false) {
    // Full path completed under budget — partial stays false.
  } else if (earlyWritten && !withinBudget()) {
    partial = true;
  }

  return {
    startOffset: best,
    total,
    calls,
    partial,
    timedOut:
      timedOut ||
      elapsed() >= PROBE_BUDGET_MS ||
      calls >= PROBE_MAX_CALLS ||
      failures >= PROBE_MAX_FAILURES,
    elapsedMs: elapsed(),
  };
}
