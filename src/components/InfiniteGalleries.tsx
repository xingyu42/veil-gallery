"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GalleryCard from "./GalleryCard";
import { describeUpstreamError } from "@/lib/upstream-error";
import type { GalleryListItem, Paginated } from "@/lib/types";

type Page = Paginated<GalleryListItem> & { next_offset?: number };

export default function InfiniteGalleries({
  initial,
  category,
  pageSize = 12,
}: {
  initial: Page;
  category?: string;
  pageSize?: number;
}) {
  const [items, setItems] = useState(initial.items);
  const [offset, setOffset] = useState(
    initial.next_offset ?? initial.offset + initial.items.length
  );
  const [hasMore, setHasMore] = useState(initial.has_next ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  // Prefetched next page keyed by the offset it was fetched for
  const prefetchRef = useRef<{ offset: number; data: Page } | null>(null);
  const prefetchingRef = useRef(false);

  const buildUrl = useCallback(
    (off: number) => {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(off),
      });
      if (category) params.set("category", category);
      return `/api/galleries?${params}`;
    },
    [category, pageSize]
  );

  const prefetchNext = useCallback(
    async (forOffset: number) => {
      if (!hasMore) return;
      if (prefetchRef.current?.offset === forOffset) return;
      if (prefetchingRef.current) return;
      prefetchingRef.current = true;
      try {
        const res = await fetch(buildUrl(forOffset));
        if (!res.ok) return;
        const data: Page = await res.json();
        prefetchRef.current = { offset: forOffset, data };
      } catch {
        // silent — loadMore will retry on demand
      } finally {
        prefetchingRef.current = false;
      }
    },
    [buildUrl, hasMore]
  );

  const applyPage = useCallback((data: Page, currentOffset: number) => {
    setItems((prev) => {
      const ids = new Set(prev.map((g) => g.id));
      return [...prev, ...data.items.filter((g) => !ids.has(g.id))];
    });
    const next = data.next_offset ?? currentOffset + pageSize;
    setOffset(next);
    setHasMore(data.has_next ?? next < data.total);
    return next;
  }, [pageSize]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      let data: Page;
      const hit = prefetchRef.current;
      if (hit && hit.offset === offset) {
        data = hit.data;
        prefetchRef.current = null;
      } else {
        const res = await fetch(buildUrl(offset));
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        data = await res.json();
      }
      const next = applyPage(data, offset);
      // Kick off prefetch for the page after this one
      void prefetchNext(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [offset, hasMore, buildUrl, applyPage, prefetchNext]);

  // Prefetch next page as soon as we have a cursor
  useEffect(() => {
    if (hasMore) void prefetchNext(offset);
  }, [offset, hasMore, prefetchNext]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "800px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const el = sentinelRef.current;
        if (!el || loadingRef.current || !hasMore) return;
        if (el.getBoundingClientRect().top <= window.innerHeight + 800) {
          void loadMore();
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const t = window.setTimeout(onScroll, 100);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(t);
    };
  }, [loadMore, hasMore]);

  useEffect(() => {
    setItems(initial.items);
    setOffset(initial.next_offset ?? initial.offset + initial.items.length);
    setHasMore(initial.has_next ?? true);
    setError(null);
    prefetchRef.current = null;
  }, [initial, category]);

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
        <div className="py-4 text-center text-sm text-status-danger">
          {describeUpstreamError(error, "源站限流中，请稍后再试")}
          <button
            onClick={() => void loadMore()}
            className="ml-3 text-accent underline"
          >
            重试
          </button>
        </div>
      )}
      {!loading && !hasMore && items.length > 0 && (
        <p className="py-6 text-center text-sm text-white/30">
          已经到底了 · 共 {items.length} 个图集
        </p>
      )}
      {!loading && !hasMore && items.length === 0 && (
        <p className="py-12 text-center text-sm text-white/40">暂无可用图集</p>
      )}
    </div>
  );
}
