"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RemoteImage from "./RemoteImage";
import AppLightbox from "./AppLightbox";
import ShortestColumnMasonry, {
  relativeHeight,
  type MasonryItem,
} from "./ShortestColumnMasonry";
import { availableImages } from "@/lib/api";
import type { GalleryDetail, GalleryImage, GalleryImagePage } from "@/lib/types";
import { describeUpstreamError, getErrorMessage } from "@/lib/upstream-error";

const PAGE_SIZE = 20;
/** First viewport row(s): 4 cols × 2 rows covers desktop LCP candidates. */
const PRIORITY_IMAGE_COUNT = 8;

type Cell = { image: GalleryImage; index: number };

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

  const masonryItems = useMemo<MasonryItem<Cell>[]>(
    () =>
      images.map((image, index) => ({
        key: image.id,
        data: { image, index },
        weight: relativeHeight(image.width, image.height),
        render: ({ image: img, index: idx }) => {
          const hasSize =
            typeof img.width === "number" &&
            typeof img.height === "number" &&
            img.width > 0 &&
            img.height > 0;

          return (
            <button
              type="button"
              onClick={() => setActiveIndex(idx)}
              className="group relative w-full cursor-zoom-in overflow-hidden rounded-lg bg-placeholder text-left ring-1 ring-border transition hover:ring-accent/40 focus:ring-2 focus:ring-accent/60"
              style={{
                aspectRatio: hasSize
                  ? `${img.width} / ${img.height}`
                  : "3 / 4",
              }}
              aria-label={`放大查看 ${gallery.title} 第 ${img.sort_order} 张`}
            >
              <RemoteImage
                id={img.id}
                alt={`${gallery.title} #${img.sort_order}`}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02] group-hover:opacity-95"
                priority={idx < PRIORITY_IMAGE_COUNT}
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/20 group-hover:opacity-100">
                <span className="keep-white rounded-full bg-black/55 px-3 py-1 text-xs text-white backdrop-blur-sm">
                  点击放大
                </span>
              </div>
            </button>
          );
        },
      })),
    [images, gallery.title]
  );

  if (images.length === 0) {
    return <p className="py-16 text-center text-subtle">该图集暂无可用图片</p>;
  }

  return (
    <>
      <ShortestColumnMasonry items={masonryItems} gapClassName="gap-3" />

      <div ref={sentinelRef} className="flex min-h-24 items-center justify-center py-6">
        {loading && (
          <div className="flex items-center gap-3 text-sm text-subtle">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            正在加载更多图片…
          </div>
        )}
        {!loading && error && hasMore && (
          <button
            type="button"
            onClick={() => void loadMore()}
            className="rounded-full border border-border px-4 py-2 text-sm text-muted transition hover:border-accent/50 hover:text-accent"
          >
            加载失败，点击重试
          </button>
        )}
        {!loading && !hasMore && (
          <p className="text-sm text-subtle">已加载全部 {images.length} 张图片</p>
        )}
      </div>

      <AppLightbox
        images={images}
        index={activeIndex}
        total={total}
        title={gallery.title}
        canLoadMore={hasMore}
        loadingMore={loading}
        onClose={() => setActiveIndex(null)}
        onIndexChange={setActiveIndex}
        onRequestMore={() => {
          void loadMore();
        }}
      />
    </>
  );
}
