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
  onLoad?: () => void;
  onError?: () => void;
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
  placeholderClassName = "aspect-[3/4] w-full animate-pulse bg-zinc-900",
  fallback,
  draggable,
  fill = true,
  onLoad,
  onError,
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      fallback ?? (
        <div
          className={`flex min-h-[120px] items-center justify-center bg-zinc-900 text-xs text-white/30 ${className}`}
        >
          图片加载失败
        </div>
      )
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
        src={imageUrl(id)}
        alt={alt}
        className={`${className} ${loaded ? "opacity-100" : "opacity-0"}`}
        loading="lazy"
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
