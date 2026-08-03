"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
 * - Disk/memory cache can finish before React attaches onLoad (or skip the
 *   event). Sync-check img.complete after commit or the tile stays opacity-0
 *   while Network still shows 200 (disk cache). Lightbox works because YARL
 *   does not gate visibility on this state.
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
  const imgRef = useRef<HTMLImageElement | null>(null);
  /** True after onLoad / onError / complete-check for the current src. */
  const settledRef = useRef(false);
  /** Track prop id without an extra render (not UI state). */
  const prevIdRef = useRef(id);

  if (prevIdRef.current !== id) {
    prevIdRef.current = id;
    setAttempt(0);
    setLoaded(false);
    setFailed(false);
    settledRef.current = false;
  }

  const baseUrl = imageUrl(id);
  const src = attempt === 0 ? baseUrl : `${baseUrl}?r=${attempt}`;

  const settle = (ok: boolean) => {
    if (settledRef.current) return;
    settledRef.current = true;
    if (ok) {
      setLoaded(true);
      onLoad?.();
    } else {
      setFailed(true);
      onError?.();
    }
  };

  // Recover when the browser serves from disk/memory cache and skips onLoad
  // (or finishes before React attaches the listener). Layout phase avoids a
  // placeholder flash on warm cache. Only promote success here — broken
  // images still go through onError (complete+naturalWidth=0 is ambiguous
  // with async decode).
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img || !img.complete) return;
    if (img.naturalWidth > 0) settle(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- settle closes over src + callbacks
  }, [src]);

  const retry = () => {
    settledRef.current = false;
    setFailed(false);
    setLoaded(false);
    setAttempt((n) => n + 1);
  };

  if (failed) {
    // fill: absolute inset so we sit above card chrome (gradient/title) and
    // keep label + retry as one mid-card stack — not a footer-looking control.
    return (
      <div
        className={
          fill
            ? "absolute inset-0 z-[1] flex flex-col items-center justify-center gap-3 bg-placeholder"
            : "relative flex min-h-[120px] min-w-[120px] flex-col items-center justify-center gap-3 bg-placeholder"
        }
      >
        <div className="flex flex-col items-center gap-3 px-3">
          {fallback ?? (
            <span className="text-center text-xs text-subtle">
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
            className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs text-muted ring-1 ring-border transition hover:bg-accent/20 hover:text-accent hover:ring-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="重新加载图片"
            title="重试"
          >
            <RetryIcon className="h-3.5 w-3.5" />
            <span>重试</span>
          </button>
        </div>
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
        key={`${id}-${attempt}`}
        ref={imgRef}
        src={src}
        alt={alt}
        className={`${className} ${loaded ? "opacity-100" : "opacity-0"}`}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        draggable={draggable}
        referrerPolicy="no-referrer"
        onLoad={() => settle(true)}
        onError={() => settle(false)}
      />
    </div>
  );
}
