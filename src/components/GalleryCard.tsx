"use client";
import Link from "next/link";
import { useState } from "react";
import { imageUrl } from "@/lib/api";
import type { GalleryListItem } from "@/lib/types";

export default function GalleryCard({ gallery }: { gallery: GalleryListItem }) {
  const coverId = gallery.cover?.image_id;
  const title = gallery.title || `Gallery #${gallery.id}`;
  const [failed, setFailed] = useState(false);

  return (
    <Link
      href={`/gallery/${gallery.id}`}
      className="group relative mb-4 break-inside-avoid overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10 transition duration-300 hover:ring-[#c9a87c]/50"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-zinc-900">
        {coverId && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl(coverId)}
            alt={title}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-white/30 text-xs">
            <span>{failed ? "图片不可用" : "No Cover"}</span>
          </div>
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
