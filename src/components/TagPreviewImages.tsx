"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import RemoteImage from "./RemoteImage";
import AppLightbox from "./AppLightbox";
import { describeUpstreamError } from "@/lib/upstream-error";
import type { GalleryImage } from "@/lib/types";

interface Props {
  imageIds: number[];
  tagName: string;
}

export default function TagPreviewImages({ imageIds, tagName }: Props) {
  const [ids, setIds] = useState(imageIds);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const images = useMemo<GalleryImage[]>(
    () =>
      ids.map((id, index) => ({
        id,
        sort_order: index + 1,
        width: null,
        height: null,
        orientation: null,
        status: "active",
        uploaded: true,
      })),
    [ids]
  );

  const reshuffle = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tag-preview?name=${encodeURIComponent(tagName)}`,
        { cache: "no-store", signal: AbortSignal.timeout(15_000) }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const next = Array.isArray(body.image_ids) ? body.image_ids : [];
      if (next.length === 0) {
        throw new Error("暂无预览图片");
      }
      setIds(next);
      setActiveIndex(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "换一批失败");
    } finally {
      setLoading(false);
    }
  }, [loading, tagName]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {images.map((image, index) => (
          <button
            key={`${image.id}-${index}`}
            type="button"
            onClick={() => setActiveIndex(index)}
            className="group relative aspect-[3/4] w-full cursor-zoom-in overflow-hidden rounded-lg bg-placeholder ring-1 ring-border transition hover:ring-accent/40"
          >
            <RemoteImage
              id={image.id}
              alt={`${tagName} #${index + 1}`}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
              placeholderClassName="h-full w-full animate-pulse bg-placeholder"
            />
          </button>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => void reshuffle()}
          disabled={loading}
          className="rounded-full bg-accent/10 px-6 py-2.5 text-sm text-accent ring-1 ring-accent/40 transition hover:ring-accent/70 disabled:opacity-50"
        >
          {loading ? "加载中…" : "换一批"}
        </button>
        <Link
          href="/galleries"
          className="rounded-full border border-accent/40 px-6 py-2.5 text-sm text-accent transition hover:bg-accent/10"
        >
          浏览全部图集
        </Link>
      </div>

      {error && (
        <p className="mt-4 text-center text-sm text-status-danger">
          {describeUpstreamError(error, "此接口限流较严，请稍后再试")}
        </p>
      )}

      <AppLightbox
        images={images}
        index={activeIndex}
        total={images.length}
        title={`#${tagName}`}
        onClose={() => setActiveIndex(null)}
        onIndexChange={setActiveIndex}
      />
    </>
  );
}
