import Link from "next/link";
import RemoteImage from "./RemoteImage";
import type { GalleryListItem } from "@/lib/types";

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
  const w = gallery.cover?.width;
  const h = gallery.cover?.height;
  const hasSize =
    typeof w === "number" && typeof h === "number" && w > 0 && h > 0;

  return (
    <Link
      href={`/gallery/${gallery.id}`}
      className="group relative block overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10 transition duration-300 hover:ring-accent/50"
    >
      <div
        className="relative w-full overflow-hidden bg-zinc-900"
        style={{ aspectRatio: hasSize ? `${w} / ${h}` : "3 / 4" }}
      >
        {coverId ? (
          <RemoteImage
            id={coverId}
            alt={title}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            placeholderClassName="h-full w-full animate-pulse bg-zinc-900"
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
