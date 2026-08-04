import type { Metadata } from "next";
import { getPopularGalleries } from "@/lib/gallery-views";
import GalleryCard from "@/components/GalleryCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "热门图集",
};

const POPULAR_LIMIT = 12;

export default async function PopularPage() {
  const items = await getPopularGalleries(POPULAR_LIMIT);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8">
        <p className="mb-2 text-[10px] tracking-[0.3em] text-accent">TRENDING</p>
        <h1 className="font-serif text-3xl tracking-wide text-foreground">
          热门图集
        </h1>
      </div>

      {items.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {items.map((gallery) => (
            <GalleryCard key={gallery.id} gallery={gallery} />
          ))}
        </div>
      ) : (
        <p className="py-20 text-center text-subtle">
          暂无热门数据，浏览图集详情后会陆续出现
        </p>
      )}
    </div>
  );
}
