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
  onLoad?: () => void;
  onError?: () => void;
}

/**
 * Upstream image component. Images are proxied through /api/image/[id] which
 * hits Vercel Edge + CDN — first request is MISS (Edge fetches upstream),
 * subsequent requests are HIT (pure CDN, no function execution or upstream traffic).
 *
 * No client-side throttling needed; rate-limit pressure shifts to Vercel's
 * shared outbound pool, and hot images serve at global CDN latency.
 */
export default function RemoteImage({
  id,
  alt,
  className = "",
  placeholderClassName = "aspect-[3/4] w-full animate-pulse bg-zinc-900",
  fallback,
  draggable,
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
    <>
      {!loaded && <div className={placeholderClassName} aria-hidden />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl(id)}
        alt={alt}
        className={loaded ? className : "hidden"}
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
    </>
  );
}
