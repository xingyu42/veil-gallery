"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Masonry from "./Masonry";
import RemoteImage from "./RemoteImage";
import Lightbox from "./Lightbox";
import { availableImages } from "@/lib/api";
import type { GalleryDetail, GalleryImage, GalleryImagePage } from "@/lib/types";
import { describeUpstreamError, getErrorMessage } from "@/lib/upstream-error";

const PAGE_SIZE = 20;

interface Props {
  gallery: GalleryDetail;
}

export default function GalleryImages({ gallery }: Props) {
  const initialImages = useMemo(
    () => availableImages(gallery.images),
    [gallery.images]
  );
  const total = gallery.uploaded_images ?? gallery.image_count ?? initialImages.length;

  const [images, setImages] = useState<GalleryImage[]>(initialImages);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(initialImages.length < total);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const imagesRef = useRef(images);
  const loadingRef = useRef(false);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  const loadMore = useCallback(async (): Promise<number> => {
    if (loadingRef.current || !hasMore) return 0;
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const offset = imagesRef.current.length;
      const response = await fetch(
        `/api/gallery/${gallery.id}/images?offset=${offset}&limit=${PAGE_SIZE}&total=${total}&after=${imagesRef.current.at(-1)?.sort_order ?? offset}`,
        { signal: AbortSignal.timeout(15000) }
      );
      const data = (await response.json()) as GalleryImagePage & { error?: string };
      if (!response.ok) throw new Error(data.error || "后续图片加载失败");

      const known = new Set(imagesRef.current.map((image) => image.id));
      const fresh = (data.items || []).filter((image) => !known.has(image.id));
      if (fresh.length === 0) {
        throw new Error("源站没有返回新的图片，请点击重试");
      }

      setImages((current) => {
        const ids = new Set(current.map((image) => image.id));
        return [...current, ...fresh.filter((image) => !ids.has(image.id))].sort(
          (a, b) => a.sort_order - b.sort_order
        );
      });
      setHasMore(data.has_more && offset + fresh.length < total);
      return fresh.length;
    } catch (caught) {
      const message = describeUpstreamError(
        getErrorMessage(caught, "后续图片加载失败"),
        "源站限流中，请稍后再试"
      );
      setError(message);
      return 0;
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [gallery.id, hasMore, total]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || error) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "1200px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [error, hasMore, loadMore]);

  const showPrevious = useCallback(() => {
    setActiveIndex((current) =>
      current === null ? null : Math.max(0, current - 1)
    );
  }, []);

  const showNext = useCallback(async () => {
    const current = activeIndex;
    if (current === null) return;
    if (current < imagesRef.current.length - 1) {
      setActiveIndex(current + 1);
      return;
    }
    if (!hasMore) return;

    const oldLength = imagesRef.current.length;
    const added = await loadMore();
    if (added > 0) setActiveIndex(oldLength);
  }, [activeIndex, hasMore, loadMore]);

  if (images.length === 0) {
    return <p className="py-16 text-center text-white/40">该图集暂无可用图片</p>;
  }

  return (
    <>
      <Masonry className="gap-3">
        {images.map((image, index) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setActiveIndex(index)}
            className="group relative mb-3 block w-full break-inside-avoid cursor-zoom-in overflow-hidden rounded-lg bg-zinc-900 text-left ring-1 ring-white/5 transition hover:ring-accent/40 focus:ring-2 focus:ring-accent/60"
            aria-label={`放大查看 ${gallery.title} 第 ${image.sort_order} 张`}
          >
            <RemoteImage
              id={image.id}
              alt={`${gallery.title} #${image.sort_order}`}
              className="w-full object-cover transition duration-300 group-hover:scale-[1.02] group-hover:opacity-95"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/20 group-hover:opacity-100">
              <span className="keep-white rounded-full bg-black/55 px-3 py-1 text-xs text-white/90 backdrop-blur-sm">
                点击放大
              </span>
            </div>
          </button>
        ))}
      </Masonry>

      <div ref={sentinelRef} className="flex min-h-24 items-center justify-center py-6">
        {loading && (
          <div className="flex items-center gap-3 text-sm text-white/40">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            正在加载更多图片…
          </div>
        )}
        {!loading && error && hasMore && (
          <button
            type="button"
            onClick={() => void loadMore()}
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/60 transition hover:border-accent/50 hover:text-accent"
          >
            加载失败，点击重试
          </button>
        )}
        {!loading && !hasMore && (
          <p className="text-sm text-white/30">已加载全部 {images.length} 张图片</p>
        )}
      </div>

      <Lightbox
        images={images}
        index={activeIndex}
        total={total}
        canLoadMore={hasMore}
        loadingMore={loading}
        title={gallery.title}
        onClose={() => setActiveIndex(null)}
        onPrevious={showPrevious}
        onNext={() => void showNext()}
      />
    </>
  );
}
