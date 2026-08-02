"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import RemoteImage from "./RemoteImage";
import type { GalleryImage } from "@/lib/types";

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
  const touchStartX = useRef<number | null>(null);
  const current = index === null ? null : images[index];
  const canPrevious = index !== null && index > 0;
  const canNext =
    index !== null && (index < images.length - 1 || canLoadMore || loadingMore);

  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && canPrevious) onPrevious();
      if (event.key === "ArrowRight" && canNext) onNext();
    },
    [canNext, canPrevious, onClose, onNext, onPrevious]
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

  if (!current || index === null) return null;

  const finishSwipe = (clientX: number) => {
    if (touchStartX.current === null) return;
    const delta = clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 50) return;
    if (delta > 0 && canPrevious) onPrevious();
    if (delta < 0 && canNext) onNext();
  };

  return (
    <div
      className="keep-white fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-2 backdrop-blur-sm sm:p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} 图片预览`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-4 py-4 text-white sm:px-6">
        <div className="min-w-0 pr-12">
          <p className="truncate text-sm text-white/80">{title}</p>
          <p className="mt-1 text-xs text-white/45">
            {index + 1} / {total}
          </p>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(255,255,255,0.1)] text-xl text-white transition hover:bg-[rgba(255,255,255,0.2)]"
          aria-label="关闭预览"
        >
          ×
        </button>
      </div>

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
        className="relative flex h-full w-full items-center justify-center"
        onClick={(event) => event.stopPropagation()}
        onTouchStart={(event) => {
          touchStartX.current = event.changedTouches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const x = event.changedTouches[0]?.clientX;
          if (typeof x === "number") finishSwipe(x);
        }}
      >
        {showSpinner && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
          </div>
        )}
        <RemoteImage
          key={current.id}
          id={current.id}
          alt={`${title} #${current.sort_order}`}
          className="max-h-[92vh] max-w-full select-none object-contain shadow-2xl"
          placeholderClassName="h-full w-full"
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

      <p className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1.5 text-xs text-white/55 backdrop-blur sm:hidden">
        左右滑动切换 · 点击空白关闭
      </p>
    </div>
  );
}
