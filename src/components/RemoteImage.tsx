"use client";

import { useState, type ReactNode } from "react";
import { imageUrl } from "@/lib/api";

interface Props {
  id: number;
  alt: string;
  className?: string;
  placeholderClassName?: string;
  fallback?: ReactNode;
  draggable?: boolean;
  /** When true (default), wrapper is h-full w-full for cards/aspect boxes. */
  fill?: boolean;
  /**
   * LCP / above-the-fold images: eager load + high fetch priority.
   * Default false keeps lazy loading for offscreen tiles.
   */
  priority?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}

function RetryIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-2.6-6.2" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

/**
 * Upstream image component. Images are proxied through /api/image/[id] which
 * hits Vercel Edge + CDN — first request is MISS (Edge fetches upstream),
 * subsequent requests are HIT (pure CDN, no function execution or upstream traffic).
 *
 * Layout contract:
 * - fill=true: one relative h-full w-full wrapper for aspect-ratio / CSS columns.
 * - fill=false: shrink-wrap for lightbox so object-contain can center naturally.
 * - Hide the not-yet-decoded image with opacity only — never display:none,
 *   or loading="lazy" will skip the request entirely.
 */
export default function RemoteImage({
  id,
  alt,
  className = "",
  placeholderClassName = "aspect-[3/4] w-full animate-pulse bg-placeholder",
  fallback,
  draggable,
  fill = true,
  priority = false,
  onLoad,
  onError,
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Bumps on each retry so the browser re-requests (cache-bust query). */
  const [attempt, setAttempt] = useState(0);

  const src =
    attempt === 0 ? imageUrl(id) : `${imageUrl(id)}?r=${attempt}`;

  const retry = () => {
    setFailed(false);
    setLoaded(false);
    setAttempt((n) => n + 1);
  };

  if (failed) {
    return (
      <div
        className={
          fill
            ? "relative flex h-full w-full flex-col items-center justify-center gap-2 bg-placeholder"
            : "relative flex min-h-[120px] min-w-[120px] flex-col items-center justify-center gap-2 bg-placeholder"
        }
      >
        {fallback ?? (
          <span className="px-2 text-center text-xs text-subtle">
            图片加载失败
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            retry();
          }}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-card text-muted ring-1 ring-border transition hover:bg-accent/20 hover:text-accent hover:ring-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="重新加载图片"
          title="重试"
        >
          <RetryIcon className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={
        fill
          ? "relative block h-full w-full"
          : "relative inline-block max-h-full max-w-full"
      }
    >
      {!loaded && (
        <div
          className={
            fill
              ? `absolute inset-0 ${placeholderClassName}`
              : `min-h-[200px] min-w-[160px] ${placeholderClassName}`
          }
          aria-hidden
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={attempt}
        src={src}
        alt={alt}
        className={`${className} ${loaded ? "opacity-100" : "opacity-0"}`}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        draggable={draggable}
        referrerPolicy="no-referrer"
        onLoad={() => {
          setLoaded(true);
          onLoad?.();
        }}
        onError={() => {
          setFailed(true);
          onError?.();
        }}
      />
    </div>
  );
}
