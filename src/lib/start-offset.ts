import { USER_AGENT, upstreamUrl } from "./upstream";
import { getUpstreamError } from "./upstream-error";

/**
 * startOffset: upstream /v1/galleries offset where uploaded images become available.
 * Verified 2026-08-02: ~75797 (ids ≈ 22650), ratio 100% for consecutive pages.
 * Probe: exponential search + binary refine + 2-page confirm (threshold 50%).
 */

const DEFAULT_START_OFFSET = 75797;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

type Cache = { offset: number; total: number; checkedAt: number };
let memory: Cache | null = null;

export function getCachedStartOffset(): number {
  if (memory && Date.now() - memory.checkedAt < CACHE_TTL_MS) {
    return memory.offset;
  }
  return memory?.offset ?? DEFAULT_START_OFFSET;
}

export function setCachedStartOffset(offset: number, total: number) {
  memory = { offset, total, checkedAt: Date.now() };
}

export function getDefaultStartOffset() {
  return DEFAULT_START_OFFSET;
}

async function fetchPage(offset: number, limit: number) {
  const res = await fetch(
    upstreamUrl(`/v1/galleries?limit=${limit}&offset=${offset}`),
    {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      // probe should be fresh
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
 * Exponential + binary probe. Expensive (~15–30 calls) — use via cron / manual only.
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
    // fallback: keep previous / default
    return { startOffset: getCachedStartOffset(), total, calls };
  }

  let lo = 0;
  let best = found;
  while (lo + 20 < best && calls < 35) {
    const mid = Math.floor((lo + best) / 2);
    const s = await sample(mid);
    if (s.ratio >= threshold) best = mid;
    else lo = mid;
  }

  // confirm 2 consecutive pages
  const c1 = await sample(best);
  const c2 = await sample(best + limit);
  if (c1.ratio < threshold || c2.ratio < threshold) {
    // nudge forward a bit
    best = Math.min(best + limit * 2, total - limit);
  }

  setCachedStartOffset(best, total);
  return { startOffset: best, total, calls };
}
