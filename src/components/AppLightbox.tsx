"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Lightbox from "yet-another-react-lightbox";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/counter.css";

import { imageUrl } from "@/lib/api";
import type { GalleryImage, ImageMeta } from "@/lib/types";

interface Props {
  images: GalleryImage[];
  index: number | null;
  total: number;
  title: string;
  canLoadMore?: boolean;
  loadingMore?: boolean;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  onRequestMore?: () => void | Promise<void>;
}

export default function AppLightbox({
  images,
  index,
  total,
  title,
  canLoadMore = false,
  loadingMore = false,
  onClose,
  onIndexChange,
  onRequestMore,
}: Props) {
  const [metaOpen, setMetaOpen] = useState(false);
  const [meta, setMeta] = useState<ImageMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  const open = index !== null;
  const current = index === null ? null : images[index];

  const slides = useMemo(
    () =>
      images.map((img) => ({
        src: imageUrl(img.id),
        width: img.width ?? undefined,
        height: img.height ?? undefined,
        alt: `${title} #${img.sort_order}`,
      })),
    [images, title]
  );

  useEffect(() => {
    if (!open) {
      setMetaOpen(false);
      setMeta(null);
      setMetaError(null);
    }
  }, [open]);

  useEffect(() => {
    setMeta(null);
    setMetaError(null);
  }, [current?.id]);

  useEffect(() => {
    if (!current || !metaOpen) return;
    let cancelled = false;
    setMetaLoading(true);
    setMetaError(null);

    fetch(`/api/image/${current.id}/meta`, {
      signal: AbortSignal.timeout(12_000),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        if (!cancelled) setMeta(body as ImageMeta);
      })
      .catch((e) => {
        if (!cancelled) {
          setMetaError(e instanceof Error ? e.message : "元数据加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setMetaLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [current, metaOpen]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "i" || event.key === "I") {
        setMetaOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  const handleView = useCallback(
    ({ index: newIndex }: { index: number }) => {
      onIndexChange(newIndex);
      if (
        canLoadMore &&
        !loadingMore &&
        onRequestMore &&
        newIndex >= images.length - 2
      ) {
        void onRequestMore();
      }
    },
    [canLoadMore, images.length, loadingMore, onIndexChange, onRequestMore]
  );

  const sizeLabel =
    meta?.width && meta?.height
      ? `${meta.width} × ${meta.height}`
      : current?.width && current?.height
        ? `${current.width} × ${current.height}`
        : null;

  return (
    <>
      <Lightbox
        open={open}
        close={onClose}
        index={index ?? 0}
        slides={slides}
        plugins={[Counter, Zoom]}
        on={{ view: handleView }}
        carousel={{
          finite: !canLoadMore,
          preload: 2,
        }}
        controller={{
          closeOnBackdropClick: true,
          closeOnPullDown: true,
        }}
        animation={{ fade: 250 }}
        styles={{
          container: { backgroundColor: "rgba(0, 0, 0, 0.95)" },
        }}
        toolbar={{
          buttons: [
            <button
              key="meta"
              type="button"
              className="yarl__button"
              onClick={() => setMetaOpen((v) => !v)}
              aria-pressed={metaOpen}
              aria-label={metaOpen ? "收起元数据" : "展开元数据"}
              title="元数据 (I)"
              style={{
                fontSize: "0.8rem",
                fontWeight: 500,
                letterSpacing: "0.02em",
                padding: "0 12px",
                color: metaOpen
                  ? "var(--yarl__color_button_active, #c9a87c)"
                  : undefined,
              }}
            >
              元数据
            </button>,
            "close",
          ],
        }}
      />

      {open && metaOpen && (
        <div
          role="presentation"
          className="fixed inset-0 z-[10001] bg-black/50"
          onClick={() => setMetaOpen(false)}
        />
      )}

      <aside
        className={`theme-dark fixed inset-y-0 right-0 z-[10002] flex w-full max-w-sm flex-col border-l border-border shadow-2xl transition-transform duration-200 ease-out sm:max-w-xs ${
          open && metaOpen
            ? "translate-x-0"
            : "pointer-events-none translate-x-full"
        }`}
        aria-hidden={!metaOpen}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <h2 className="text-xs tracking-[0.2em] text-accent">元数据</h2>
          <button
            type="button"
            onClick={() => setMetaOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-card hover:text-foreground"
            aria-label="关闭元数据"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {metaLoading && <p className="text-sm text-subtle">加载中…</p>}

          {!metaLoading && metaError && (
            <p className="text-sm text-subtle">暂无元数据</p>
          )}

          {!metaLoading && !metaError && meta && (
            <dl className="space-y-4 text-sm">
              {sizeLabel && (
                <div>
                  <dt className="text-xs text-subtle">尺寸</dt>
                  <dd className="mt-1 text-foreground">{sizeLabel}</dd>
                </div>
              )}
              {meta.orientation && (
                <div>
                  <dt className="text-xs text-subtle">方向</dt>
                  <dd className="mt-1 capitalize text-foreground">
                    {meta.orientation}
                  </dd>
                </div>
              )}
              {meta.gallery && (
                <div>
                  <dt className="text-xs text-subtle">图集</dt>
                  <dd className="mt-1">
                    <Link
                      href={`/gallery/${meta.gallery.id}`}
                      className="text-accent transition hover:underline"
                      onClick={onClose}
                    >
                      {meta.gallery.title}
                    </Link>
                    {meta.gallery.category && (
                      <p className="mt-1 text-xs text-muted">
                        {meta.gallery.category}
                      </p>
                    )}
                  </dd>
                </div>
              )}
              {meta.tags && meta.tags.length > 0 && (
                <div>
                  <dt className="text-xs text-subtle">标签</dt>
                  <dd className="mt-2 flex flex-wrap gap-1.5">
                    {meta.tags.map((tag) => (
                      <Link
                        key={tag}
                        href={`/tag/${encodeURIComponent(tag)}`}
                        className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted transition hover:border-accent/50 hover:text-accent"
                        onClick={onClose}
                      >
                        #{tag}
                      </Link>
                    ))}
                  </dd>
                </div>
              )}
              {current && (
                <div>
                  <dt className="text-xs text-subtle">图片 ID</dt>
                  <dd className="mt-1 font-mono text-xs text-muted">
                    {current.id}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-subtle">位置</dt>
                <dd className="mt-1 text-foreground">
                  {(index ?? 0) + 1} / {total}
                </dd>
              </div>
            </dl>
          )}

          {!metaLoading && !metaError && !meta && (
            <p className="text-sm text-subtle">暂无元数据</p>
          )}
        </div>
      </aside>
    </>
  );
}
