import { isDisplayableGallery } from "./api";
import { getRedis } from "./redis";
import type { GalleryListItem } from "./types";
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
 *
 * Note: calibrated for the unfiltered list only. Category feeds must start at 0.
 */

const REDIS_KEY = "gallery:start_offset";
const MEMORY_TTL_MS = 6 * 60 * 60 * 1000; // 6h

/**
 * Probe budget under Vercel maxDuration=60.
 * Upstream latency grows with offset (~1s@0, ~7s@50k, ~10s@80k, ~13s@98k).
 *
 * Strategy:
 * 1. Sample head
 * 2. Walk percentiles [0.5 → 0.7 → 0.85 → 0.95 → EOF] for first dense upper bound
 *    (avoids always paying EOF latency when mid-range is already dense)
 * 3. Bisect [lo, hi] until gap ≤ BINARY_STOP_GAP or budget exhausted
 */
const PROBE_BUDGET_MS = 45_000;
const PROBE_FETCH_TIMEOUT_MS = 15_000;
const PROBE_MAX_CALLS = 10;
const PROBE_SAMPLE_LIMIT = 10;
/** Stop refining when lo/hi gap is at most this many offsets. */
const BINARY_STOP_GAP = 500;
const PROBE_MAX_FAILURES = 3;
/** Fractions of (total - sample) used to find a dense upper bound before bisection. */
const UPPER_BOUND_PERCENTILES = [0.5, 0.7, 0.85, 0.95, 1] as const;

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
 * Resolve the gallery list start offset (unfiltered feeds only).
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
    items: GalleryListItem[];
    total: number;
  }>;
}

function pageRatio(items: GalleryListItem[]) {
  if (!items.length) return 0;
  const good = items.filter(isDisplayableGallery).length;
  return good / items.length;
}

function percentileOffset(total: number, fraction: number) {
  const maxOff = Math.max(0, total - PROBE_SAMPLE_LIMIT);
  if (fraction >= 1) return maxOff;
  return Math.max(0, Math.min(maxOff, Math.floor(maxOff * fraction)));
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
 * Budgeted boundary search for the first dense offset (unfiltered list).
 *
 * Assumes density is roughly monotonic with offset (sparse head → dense tail),
 * which matches upstream gallery upload history.
 *
 * 1. Sample head (0): if dense → startOffset=0
 * 2. Walk percentiles for first dense upper bound (prefer mid-range over EOF)
 * 3. Bisect [lo, hi] until gap ≤ BINARY_STOP_GAP or budget exhausted
 * 4. Early-write first refined dense hi so mid-run timeout still warms Redis
 * Never writes 0 solely because the probe failed.
 * Never early-writes an unrefined near-EOF upper bound (would starve the feed).
 */
export async function probeStartOffset(threshold = 0.5): Promise<ProbeResult> {
  const started = Date.now();
  let calls = 0;
  let failures = 0;
  let total = 0;
  let partial = false;
  let timedOut = false;

  const elapsed = () => Date.now() - started;

  const withinBudget = () =>
    elapsed() < PROBE_BUDGET_MS &&
    calls < PROBE_MAX_CALLS &&
    failures < PROBE_MAX_FAILURES;

  const markBudgetExhausted = () => {
    timedOut =
      timedOut ||
      elapsed() >= PROBE_BUDGET_MS ||
      calls >= PROBE_MAX_CALLS ||
      failures >= PROBE_MAX_FAILURES;
  };

  const sample = async (
    offset: number
  ): Promise<{ total: number; ratio: number } | null> => {
    if (!withinBudget()) {
      markBudgetExhausted();
      return null;
    }
    calls += 1;
    try {
      const d = await fetchPage(offset, PROBE_SAMPLE_LIMIT);
      return { total: d.total, ratio: pageRatio(d.items || []) };
    } catch (error) {
      failures += 1;
      const isTimeout =
        error instanceof Error &&
        (error.name === "TimeoutError" ||
          error.name === "AbortError" ||
          /timeout|aborted/i.test(error.message));
      console.error(
        `[start-offset] probe sample failed at offset=${offset}` +
          (isTimeout ? " (timeout)" : "") +
          ` failures=${failures}/${PROBE_MAX_FAILURES}:`,
        isTimeout ? error.message : error
      );
      if (failures >= PROBE_MAX_FAILURES) {
        timedOut = true;
      }
      return null;
    }
  };

  const done = (
    startOffset: number,
    opts: { partial: boolean; timedOut: boolean }
  ): ProbeResult => ({
    startOffset,
    total,
    calls,
    partial: opts.partial,
    timedOut: opts.timedOut,
    elapsedMs: elapsed(),
  });

  // --- 1. Head ---
  const head = await sample(0);
  if (!head) {
    return done(await getStartOffset(), { partial: false, timedOut: true });
  }
  total = head.total;

  if (head.ratio >= threshold) {
    await setStartOffset(0, total);
    return done(0, { partial: false, timedOut: false });
  }

  if (total <= PROBE_SAMPLE_LIMIT) {
    // Tiny catalog, all sparse.
    return done(await getStartOffset(), {
      partial: false,
      timedOut: false,
    });
  }

  // --- 2. Percentile walk for dense upper bound (lo stays last known sparse) ---
  let lo = 0;
  let hi: number | null = null;

  for (const fraction of UPPER_BOUND_PERCENTILES) {
    if (!withinBudget()) break;

    const cand = percentileOffset(total, fraction);
    if (cand <= lo) continue;

    const s = await sample(cand);
    if (!s) {
      partial = true;
      break;
    }

    if (s.ratio >= threshold) {
      hi = cand;
      break;
    }
    lo = cand;
  }

  if (hi == null) {
    // No dense region found (or budget died before one) — do not write 0 / EOF.
    return done(await getStartOffset(), {
      partial: false,
      timedOut:
        timedOut ||
        elapsed() >= PROBE_BUDGET_MS ||
        calls >= PROBE_MAX_CALLS ||
        failures >= PROBE_MAX_FAILURES,
    });
  }

  // Only early-write when hi is clearly left of near-EOF (a real mid-range hit).
  const nearEof = percentileOffset(total, 1);
  let refined = hi < nearEof;
  if (refined) {
    await setStartOffset(hi, total);
  }

  // --- 3. Bisect first dense offset ---
  while (lo + BINARY_STOP_GAP < hi && withinBudget()) {
    const mid = Math.floor((lo + hi) / 2);
    if (mid <= lo || mid >= hi) break;

    const s = await sample(mid);
    if (!s) {
      partial = true;
      break;
    }

    if (s.ratio >= threshold) {
      hi = mid;
      refined = true;
      await setStartOffset(hi, total);
    } else {
      lo = mid;
    }
  }

  if (!withinBudget()) {
    partial = true;
    markBudgetExhausted();
  }

  if (!refined) {
    // Only near-EOF was proven dense — too close to EOF to use as startOffset.
    return done(await getStartOffset(), {
      partial: false,
      timedOut:
        timedOut ||
        elapsed() >= PROBE_BUDGET_MS ||
        calls >= PROBE_MAX_CALLS ||
        failures >= PROBE_MAX_FAILURES,
    });
  }

  // Final persist (refreshes checkedAt even if hi unchanged).
  await setStartOffset(hi, total);

  return done(hi, {
    partial,
    timedOut:
      timedOut ||
      elapsed() >= PROBE_BUDGET_MS ||
      calls >= PROBE_MAX_CALLS ||
      failures >= PROBE_MAX_FAILURES,
  });
}
