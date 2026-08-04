"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GalleryCard from "./GalleryCard";
import type { PopularPage } from "@/lib/gallery-views";

export type PopularPageData = Pick<
  PopularPage,
  "items" | "total" | "next_offset" | "has_next"
>;

const FETCH_TIMEOUT_MS = 15_000;

/**
 * Infinite scroll over /api/popular-galleries. Unlike InfiniteGalleries the
 * source is a dense local Redis ZSET — no sparse-scan or empty-streak handling.
 * Parent remounts this component (key=window) when the board changes.
 */
export default function InfinitePopular({
  initial,
  window,
  pageSize = 12,
}: {
  initial: PopularPageData;
  window: string;
  pageSize?: number;
}) {
  const [items, setItems] = useState(initial.items);
  const [hasMore, setHasMore] = useState(initial.has_next);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  // Cursor state lives in refs: it drives fetch URLs/guards, never rendering,
  // so loadMore (and the observer) stays stable across page loads.
  const offsetRef = useRef(initial.next_offset);
  const hasMoreRef = useRef(initial.has_next);
  const seenRef = useRef(new Set(initial.items.map((g) => g.id)));

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/popular-galleries?window=${window}&limit=${pageSize}&offset=${offsetRef.current}`,
        { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PopularPageData = await res.json();
      const seen = seenRef.current;
      const fresh = data.items.filter((g) => !seen.has(g.id));
      fresh.forEach((g) => seen.add(g.id));
      setItems((prev) => [...prev, ...fresh]);
      offsetRef.current = data.next_offset;
      hasMoreRef.current = data.has_next;
      setHasMore(data.has_next);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [window, pageSize]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "600px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {items.map((g) => (
          <GalleryCard key={g.id} gallery={g} />
        ))}
      </div>
      <div
        ref={sentinelRef}
        className="flex min-h-24 items-center justify-center py-6"
      >
        {loading && (
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
        )}
      </div>
      {error && (
        <div className="py-4 text-center text-sm text-subtle">
          加载失败
          <button
            onClick={() => void loadMore()}
            className="ml-3 text-accent underline"
          >
            重试
          </button>
        </div>
      )}
      {!loading && !hasMore && items.length > 0 && (
        <p className="py-6 text-center text-sm text-subtle">
          已经到底了 · 共 {items.length} 个图集
        </p>
      )}
    </div>
  );
}
