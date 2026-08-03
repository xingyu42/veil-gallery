"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GalleryCard from "./GalleryCard";
import ShortestColumnMasonry, {
  relativeHeight,
  type MasonryItem,
} from "./ShortestColumnMasonry";
import { describeUpstreamError } from "@/lib/upstream-error";
import type { GalleryListItem } from "@/lib/types";

export default function RandomGalleries({
  initial,
  category,
  pageSize = 6,
}: {
  initial: GalleryListItem[];
  category?: string;
  pageSize?: number;
}) {
  const [items, setItems] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const emptyStreakRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchBatch = useCallback(
    async (replace: boolean) => {
      if (loadingRef.current) return false;
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ count: String(pageSize) });
        if (category) params.set("category", category);
        const res = await fetch(`/api/random-galleries?${params}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const data: { items: GalleryListItem[] } = await res.json();
        const batch = data.items || [];
        if (!mountedRef.current) return false;

        if (replace) {
          setItems(batch);
          emptyStreakRef.current = 0;
          setPaused(false);
          return batch.length > 0;
        }

        setItems((prev) => {
          const ids = new Set(prev.map((g) => g.id));
          const added = batch.filter((g) => !ids.has(g.id));
          return added.length ? [...prev, ...added] : prev;
        });

        if (batch.length === 0) {
          emptyStreakRef.current += 1;
          if (emptyStreakRef.current >= 3) setPaused(true);
          return false;
        }
        emptyStreakRef.current = 0;
        setPaused(false);
        return true;
      } catch (e) {
        if (mountedRef.current) {
          setError(e instanceof Error ? e.message : "加载失败");
        }
        return false;
      } finally {
        loadingRef.current = false;
        if (mountedRef.current) setLoading(false);
      }
    },
    [category, pageSize]
  );

  const tryLoadWhileVisible = useCallback(async () => {
    if (loadingRef.current || emptyStreakRef.current >= 3) return;
    const el = sentinelRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top > vh + 800) return;

    await fetchBatch(false);

    if (emptyStreakRef.current < 3 && !loadingRef.current) {
      window.setTimeout(() => {
        const el2 = sentinelRef.current;
        if (!el2 || loadingRef.current) return;
        const r = el2.getBoundingClientRect();
        const vh2 = window.innerHeight || document.documentElement.clientHeight;
        if (r.top <= vh2 + 800) {
          void tryLoadWhileVisible();
        }
      }, 400);
    }
  }, [fetchBatch]);

  const reshuffle = useCallback(async () => {
    emptyStreakRef.current = 0;
    setPaused(false);
    await fetchBatch(true);
  }, [fetchBatch]);

  const resume = useCallback(() => {
    emptyStreakRef.current = 0;
    setPaused(false);
    void tryLoadWhileVisible();
  }, [tryLoadWhileVisible]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void tryLoadWhileVisible();
      },
      { root: null, rootMargin: "800px 0px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [tryLoadWhileVisible]);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        void tryLoadWhileVisible();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const t = window.setTimeout(() => void tryLoadWhileVisible(), 100);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(t);
    };
  }, [tryLoadWhileVisible]);

  useEffect(() => {
    setItems(initial);
    emptyStreakRef.current = 0;
    setPaused(false);
    setError(null);
  }, [initial, category]);

  const masonryItems = useMemo<MasonryItem<GalleryListItem>[]>(
    () =>
      items.map((g) => ({
        key: `${g.id}-${g.cover?.image_id ?? "none"}`,
        data: g,
        weight: relativeHeight(g.cover?.width, g.cover?.height),
        render: (gallery) => <GalleryCard gallery={gallery} />,
      })),
    [items]
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void reshuffle()}
          disabled={loading}
          className="rounded-full bg-accent/10 px-4 py-2 text-sm text-accent ring-1 ring-accent/40 transition hover:ring-accent/70 disabled:opacity-50"
        >
          换一批
        </button>
        <span className="text-xs text-white/30">下拉自动加载更多</span>
      </div>

      <ShortestColumnMasonry items={masonryItems} gapClassName="gap-4" />

      <div
        ref={sentinelRef}
        className="flex min-h-24 items-center justify-center py-6"
      >
        {loading && (
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
        )}
        {!loading && paused && (
          <button
            type="button"
            onClick={resume}
            className="text-sm text-accent underline"
          >
            继续加载
          </button>
        )}
      </div>

      {error && (
        <div className="py-4 text-center text-sm text-status-danger">
          {describeUpstreamError(error, "源站限流中，请稍后再试（约30分钟）")}
          <button onClick={resume} className="ml-3 text-accent underline">
            重试
          </button>
        </div>
      )}

      {!loading && items.length === 0 && (
        <p className="py-12 text-center text-sm text-white/40">暂无随机图集</p>
      )}
    </div>
  );
}
