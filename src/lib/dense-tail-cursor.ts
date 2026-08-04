export type DenseTailWindow = {
  total: number;
  offset: number;
  items: readonly boolean[];
};

export type DenseTailReader = (
  offset: number,
  limit: number
) => Promise<DenseTailWindow>;

type DenseTailSearchOptions = {
  total: number;
  windowSize?: number;
  maxWindows?: number;
  readWindow: DenseTailReader;
};

type LocateDenseTailOptions = DenseTailSearchOptions & {
  cachedDenseCount: number;
};

type DenseTailFound = {
  status: "found";
  total: number;
  startOffset: number;
  windowsRead: number;
};

type DenseTailStale = {
  status: "stale";
  expectedTotal: number;
  observedTotal: number;
  windowsRead: number;
};

type DenseTailExhausted = {
  status: "exhausted";
  total: number;
  windowsRead: number;
};

type DenseTailInvalid = {
  status: "invalid";
  reason: "non-monotonic-window" | "incomplete-window" | "unexpected-offset";
  total: number;
  offset?: number;
  windowsRead: number;
};

export type DenseTailResult =
  | DenseTailFound
  | DenseTailStale
  | DenseTailExhausted
  | DenseTailInvalid;

function clampWindowSize(value = 100): number {
  return Math.max(1, Math.min(100, Math.floor(value)));
}

function found(
  total: number,
  startOffset: number,
  windowsRead: number
): DenseTailFound {
  return { status: "found", total, startOffset, windowsRead };
}

/**
 * Validate a fetched window against expectations and classify its density.
 * Returns a failure result, "dense"/"sparse", or the boundary start offset.
 */
function inspectWindow(
  page: DenseTailWindow,
  expectedTotal: number,
  expectedOffset: number,
  expectedItems: number,
  windowsRead: number
): DenseTailStale | DenseTailInvalid | "dense" | "sparse" | number {
  if (page.total !== expectedTotal) {
    return {
      status: "stale",
      expectedTotal,
      observedTotal: page.total,
      windowsRead,
    };
  }

  if (page.offset !== expectedOffset) {
    return {
      status: "invalid",
      reason: "unexpected-offset",
      total: expectedTotal,
      offset: page.offset,
      windowsRead,
    };
  }

  if (page.items.length !== expectedItems) {
    return {
      status: "invalid",
      reason: "incomplete-window",
      total: expectedTotal,
      offset: page.offset,
      windowsRead,
    };
  }

  // Single pass: first true index while verifying no false follows it.
  let firstDense = -1;
  for (let i = 0; i < page.items.length; i += 1) {
    if (page.items[i]) {
      if (firstDense < 0) firstDense = i;
    } else if (firstDense >= 0) {
      return {
        status: "invalid",
        reason: "non-monotonic-window",
        total: expectedTotal,
        offset: page.offset,
        windowsRead,
      };
    }
  }

  if (firstDense < 0) return "sparse";
  if (firstDense === 0) return "dense";
  return page.offset + firstDense;
}

function isFailure(
  inspection: ReturnType<typeof inspectWindow>
): inspection is DenseTailStale | DenseTailInvalid {
  return typeof inspection === "object";
}

/** Correct a cached dense-tail length within a bounded local neighborhood. */
export async function locateDenseTail({
  total,
  cachedDenseCount,
  windowSize: requestedWindowSize,
  maxWindows: requestedMaxWindows = 4,
  readWindow,
}: LocateDenseTailOptions): Promise<DenseTailResult> {
  if (total === 0) return found(0, 0, 0);

  const windowSize = Math.min(clampWindowSize(requestedWindowSize), total);
  const maxWindows = Math.max(1, Math.floor(requestedMaxWindows));
  const predictedOffset = Math.max(
    0,
    Math.min(total, total - Math.max(0, Math.floor(cachedDenseCount)))
  );
  let nextOffset = Math.max(
    0,
    Math.min(total - windowSize, predictedOffset - Math.floor(windowSize / 2))
  );
  let windowsRead = 0;
  let low = 0;
  let high = total;

  while (windowsRead < maxWindows) {
    const page = await readWindow(nextOffset, windowSize);
    windowsRead += 1;
    const inspection = inspectWindow(
      page,
      total,
      nextOffset,
      Math.min(windowSize, total - nextOffset),
      windowsRead
    );

    if (isFailure(inspection)) return inspection;
    if (typeof inspection === "number") {
      return found(total, inspection, windowsRead);
    }

    if (inspection === "dense") {
      high = Math.min(high, nextOffset);
      if (low === high) return found(total, low, windowsRead);
      nextOffset = Math.max(low, nextOffset - windowSize);
      continue;
    }

    low = Math.max(low, nextOffset + page.items.length);
    if (low === high) return found(total, low, windowsRead);
    nextOffset = Math.min(high, nextOffset + page.items.length);
  }

  return { status: "exhausted", total, windowsRead };
}

/** Find the exact sparse-to-dense boundary with a windowed lower-bound search. */
export async function recoverDenseTail({
  total,
  windowSize: requestedWindowSize,
  maxWindows: requestedMaxWindows = 14,
  readWindow,
}: DenseTailSearchOptions): Promise<DenseTailResult> {
  if (total === 0) return found(0, 0, 0);

  const windowSize = Math.min(clampWindowSize(requestedWindowSize), total);
  const maxWindows = Math.max(1, Math.floor(requestedMaxWindows));
  let low = 0;
  let high = total;
  let windowsRead = 0;

  while (low < high && windowsRead < maxWindows) {
    const span = high - low;
    const limit = Math.min(windowSize, span);
    const offset =
      span <= windowSize
        ? low
        : Math.max(low, Math.floor((low + high - limit) / 2));
    const page = await readWindow(offset, limit);
    windowsRead += 1;
    const inspection = inspectWindow(page, total, offset, limit, windowsRead);

    if (isFailure(inspection)) return inspection;
    if (typeof inspection === "number") {
      return found(total, inspection, windowsRead);
    }

    if (inspection === "dense") {
      high = offset;
    } else {
      low = offset + page.items.length;
    }
  }

  if (low === high) return found(total, low, windowsRead);
  return { status: "exhausted", total, windowsRead };
}
