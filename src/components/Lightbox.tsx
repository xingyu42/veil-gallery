"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import RemoteImage from "./RemoteImage";
import type { GalleryImage, ImageMeta } from "@/lib/types";

interface Props {
  images: GalleryImage[];
  index: number | null;
  total: number;
  title: string;
  canLoadMore?: boolean;
  loadingMore?: boolean;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

export default function Lightbox({
  images,
  index,
  total,
  title,
  canLoadMore = false,
  loadingMore = false,
  onClose,
  onPrevious,
  onNext,
}: Props) {
  const [showSpinner, setShowSpinner] = useState(true);
  const [metaOpen, setMetaOpen] = useState(false);
  const [meta, setMeta] = useState<ImageMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);
  const current = index === null ? null : images[index];
  const canPrevious = index !== null && index > 0;
  const canNext =
    index !== null && (index < images.length - 1 || canLoadMore || loadingMore);

  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (metaOpen) {
          setMetaOpen(false);
          return;
        }
        onClose();
      }
      if (event.key === "ArrowLeft" && canPrevious) onPrevious();
      if (event.key === "ArrowRight" && canNext) onNext();
      if (event.key === "i" || event.key === "I") {
        setMetaOpen((open) => !open);
      }
    },
    [canNext, canPrevious, metaOpen, onClose, onNext, onPrevious]
  );

  useEffect(() => {
    if (!current) return;
    setShowSpinner(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [current, handleKey]);

  // Fetch metadata only when the panel is open (saves upstream quota).
  useEffect(() => {
    if (!current || !metaOpen) return;
    let cancelled = false;
    setMeta(null);
    setMetaError(null);
    setMetaLoading(true);
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

  if (!current || index === null) return null;

  const finishSwipe = (clientX: number) => {
    if (touchStartX.current === null) return;
    const delta = clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 50) return;
    if (delta > 0 && canPrevious) onPrevious();
    if (delta < 0 && canNext) onNext();
  };

  const sizeLabel =
    meta?.width && meta?.height
      ? `${meta.width} × ${meta.height}`
      : current.width && current.height
        ? `${current.width} × ${current.height}`
        : null;

  return (
    <div
      className="keep-white fixed inset-0 z-[100] bg-black backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} 图片预览`}
    >
      {/* Top bar — above dimmer so controls stay usable */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-4 py-4 text-white sm:px-6">
        <div className="min-w-0 pr-4">
          <p className="truncate text-sm text-white/80">{title}</p>
          <p className="mt-1 text-xs text-white/45">
            {index + 1} / {total}
          </p>
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setMetaOpen((open) => !open);
            }}
            className={`rounded-full px-3 py-2 text-xs transition ${
              metaOpen
                ? "bg-accent/20 text-accent ring-1 ring-accent/50"
                : "bg-[rgba(255,255,255,0.1)] text-white/80 hover:bg-[rgba(255,255,255,0.2)]"
            }`}
            aria-pressed={metaOpen}
            aria-label={metaOpen ? "收起元数据" : "展开元数据"}
            title="元数据 (I)"
          >
            元数据
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(255,255,255,0.1)] text-xl text-white transition hover:bg-[rgba(255,255,255,0.2)]"
            aria-label="关闭预览"
          >
            ×
          </button>
        </div>
      </div>

      {/* Image stage — solid black so light-mode overrides cannot flash beige/white */}
      <div
        className="relative flex h-full w-full items-center justify-center bg-black p-3 pt-16 sm:p-6 sm:pt-16"
        onClick={onClose}
        onTouchStart={(event) => {
          touchStartX.current = event.changedTouches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const x = event.changedTouches[0]?.clientX;
          if (typeof x === "number") finishSwipe(x);
        }}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onPrevious();
          }}
          disabled={!canPrevious}
          className="absolute left-2 z-20 hidden h-12 w-12 items-center justify-center rounded-full bg-black/45 text-3xl text-white transition hover:bg-black/70 disabled:pointer-events-none disabled:opacity-20 sm:flex"
          aria-label="上一张"
        >
          ‹
        </button>

        <div
          className="relative flex max-h-full max-w-full items-center justify-center bg-black"
          onClick={(event) => event.stopPropagation()}
        >
          {showSpinner && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            </div>
          )}
          <RemoteImage
            key={current.id}
            id={current.id}
            fill={false}
            alt={`${title} #${current.sort_order}`}
            className="max-h-[85vh] max-w-[min(100%,1100px)] select-none object-contain shadow-2xl"
            placeholderClassName="h-[40vh] w-[30vh] animate-pulse rounded-lg bg-black sm:h-[50vh]"
            draggable={false}
            onLoad={() => setShowSpinner(false)}
            onError={() => setShowSpinner(false)}
          />
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onNext();
          }}
          disabled={!canNext || loadingMore}
          className="absolute right-2 z-20 hidden h-12 w-12 items-center justify-center rounded-full bg-black/45 text-3xl text-white transition hover:bg-black/70 disabled:pointer-events-none disabled:opacity-20 sm:flex"
          aria-label={loadingMore ? "正在加载下一张" : "下一张"}
        >
          {loadingMore && index === images.length - 1 ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            "›"
          )}
        </button>

        <p className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1.5 text-xs text-white/55 backdrop-blur sm:hidden">
          左右滑动切换 · 点击空白关闭
        </p>
      </div>

      {/* Dimmer: must be a div — native button defaults to a light face and caused the white-out */}
      {metaOpen && (
        <div
          role="presentation"
          className="absolute inset-0 z-30 bg-black/50"
          onClick={() => setMetaOpen(false)}
        />
      )}

      {/* Metadata slide-over (default collapsed) */}
      <aside
        className={`absolute inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l border-white/10 bg-zinc-950 shadow-2xl transition-transform duration-200 ease-out sm:max-w-xs ${
          metaOpen ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
        aria-hidden={!metaOpen}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/10 px-4 py-4">
          <h2 className="text-xs tracking-[0.2em] text-accent">元数据</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {metaLoading && <p className="text-sm text-white/40">加载中…</p>}

          {!metaLoading && metaError && (
            <p className="text-sm text-white/40">暂无元数据</p>
          )}

          {!metaLoading && !metaError && meta && (
            <dl className="space-y-4 text-sm">
              {sizeLabel && (
                <div>
                  <dt className="text-xs text-white/40">尺寸</dt>
                  <dd className="mt-1 text-white/85">{sizeLabel}</dd>
                </div>
              )}
              {meta.orientation && (
                <div>
                  <dt className="text-xs text-white/40">方向</dt>
                  <dd className="mt-1 capitalize text-white/85">
                    {meta.orientation}
                  </dd>
                </div>
              )}
              {meta.gallery && (
                <div>
                  <dt className="text-xs text-white/40">图集</dt>
                  <dd className="mt-1">
                    <Link
                      href={`/gallery/${meta.gallery.id}`}
                      className="text-accent transition hover:underline"
                      onClick={onClose}
                    >
                      {meta.gallery.title}
                    </Link>
                    {meta.gallery.category && (
                      <p className="mt-1 text-xs text-white/45">
                        {meta.gallery.category}
                      </p>
                    )}
                  </dd>
                </div>
              )}
              {meta.tags && meta.tags.length > 0 && (
                <div>
                  <dt className="text-xs text-white/40">标签</dt>
                  <dd className="mt-2 flex flex-wrap gap-1.5">
                    {meta.tags.map((tag) => (
                      <Link
                        key={tag}
                        href={`/tag/${encodeURIComponent(tag)}`}
                        className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/70 transition hover:border-accent/50 hover:text-accent"
                        onClick={onClose}
                      >
                        #{tag}
                      </Link>
                    ))}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-white/40">图片 ID</dt>
                <dd className="mt-1 font-mono text-xs text-white/50">
                  {current.id}
                </dd>
              </div>
            </dl>
          )}

          {!metaLoading && !metaError && !meta && (
            <p className="text-sm text-white/40">暂无元数据</p>
          )}
        </div>
      </aside>
    </div>
  );
}
