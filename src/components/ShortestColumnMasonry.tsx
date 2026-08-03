"use client";

import { useMemo, useSyncExternalStore, type ReactNode } from "react";

/** Match Tailwind sm/md/lg breakpoints used elsewhere. */
function columnCountForWidth(width: number): number {
  if (width >= 1024) return 4;
  if (width >= 768) return 3;
  if (width >= 640) return 2;
  return 1;
}

/**
 * SSR / hydration default: md (3 cols).
 * Avoids the old useState(1) → client 4 jump that drove CLS on desktop.
 * Mobile may still adjust 3→1/2 once; that shift is smaller than 1→4.
 */
const SSR_COLUMN_COUNT = 3;

function subscribeColumnCount(onStoreChange: () => void): () => void {
  window.addEventListener("resize", onStoreChange);
  return () => window.removeEventListener("resize", onStoreChange);
}

function getColumnCountSnapshot(): number {
  return columnCountForWidth(window.innerWidth);
}

function getServerColumnCountSnapshot(): number {
  return SSR_COLUMN_COUNT;
}

function useColumnCount(): number {
  return useSyncExternalStore(
    subscribeColumnCount,
    getColumnCountSnapshot,
    getServerColumnCountSnapshot
  );
}

/** Relative height unit for packing (width normalized to 1). */
export function relativeHeight(
  width: number | null | undefined,
  height: number | null | undefined,
  fallback = 4 / 3
): number {
  if (
    typeof width === "number" &&
    typeof height === "number" &&
    width > 0 &&
    height > 0
  ) {
    return height / width;
  }
  return fallback;
}

export interface MasonryItem<T> {
  key: string | number;
  data: T;
  /** Relative height used only for column packing */
  weight: number;
  render: (data: T) => ReactNode;
}

interface Props<T> {
  items: MasonryItem<T>[];
  className?: string;
  gapClassName?: string;
}

/**
 * Pinterest-style masonry: place items in order into the currently shortest column.
 * Reading order stays roughly 1 → 2 → 3 → 4 across the top row, then continues.
 */
export default function ShortestColumnMasonry<T>({
  items,
  className = "",
  gapClassName = "gap-3",
}: Props<T>) {
  const columnCount = useColumnCount();

  const columns = useMemo(() => {
    const cols: MasonryItem<T>[][] = Array.from(
      { length: columnCount },
      () => []
    );
    const heights = Array.from({ length: columnCount }, () => 0);

    for (const item of items) {
      let minIdx = 0;
      for (let i = 1; i < columnCount; i++) {
        if (heights[i] < heights[minIdx]) minIdx = i;
      }
      cols[minIdx].push(item);
      heights[minIdx] += item.weight;
    }

    return cols;
  }, [items, columnCount]);

  return (
    <div className={`flex ${gapClassName} ${className}`}>
      {columns.map((col, colIdx) => (
        <div key={colIdx} className={`flex min-w-0 flex-1 flex-col ${gapClassName}`}>
          {col.map((item) => (
            <div key={item.key}>{item.render(item.data)}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
