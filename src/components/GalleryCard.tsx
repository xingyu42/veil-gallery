"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import RemoteImage from "./RemoteImage";
import type { GalleryListItem } from "@/lib/types";

/** Hover dwell before route prefetch — filters list-scan sweeps. */
const HOVER_PREFETCH_MS = 150;

/** Session-scoped: same gallery id prefetched at most once (all cards/pages). */
const prefetchedGalleryIds = new Set<number>();

function CoverPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-xs text-[color:var(--muted)]">
      <span>{label}</span>
    </div>
  );
}

export default function GalleryCard({ gallery }: { gallery: GalleryListItem }) {
  const coverId = gallery.cover?.image_id;
  const title = gallery.title || `Gallery #${gallery.id}`;
  const href = `/gallery/${gallery.id}`;
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoverTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearHoverTimer(), [clearHoverTimer]);

  const scheduleHoverPrefetch = () => {
    if (prefetchedGalleryIds.has(gallery.id)) return;
    clearHoverTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (prefetchedGalleryIds.has(gallery.id)) return;
      prefetchedGalleryIds.add(gallery.id);
      router.prefetch(href);
    }, HOVER_PREFETCH_MS);
  };

  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={scheduleHoverPrefetch}
      onMouseLeave={clearHoverTimer}
      className="group relative block overflow-hidden rounded-lg bg-card ring-1 ring-border transition duration-300 hover:ring-accent/50"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-placeholder">
        {coverId ? (
          <RemoteImage
            id={coverId}
            alt={title}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            placeholderClassName="h-full w-full animate-pulse bg-placeholder"
            fallback={<CoverPlaceholder label="图片不可用" />}
          />
        ) : (
          <CoverPlaceholder label="No Cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90" />
        <div className="absolute bottom-0 left-0 right-0 p-3 keep-white">
          <h3 className="line-clamp-2 text-sm font-medium text-white">{title}</h3>
          <div className="mt-1 flex items-center justify-between text-xs text-white/70">
            <span>{gallery.category || "—"}</span>
            <span>{gallery.image_count} 张</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
