import Link from "next/link";
import {
  getSiteConfig,
  getFeaturedTags,
  getGalleries,
  getCategories,
} from "@/lib/api";
import { getCachedStartOffset } from "@/lib/start-offset";
import FeaturedBar from "@/components/FeaturedBar";
import InfiniteGalleries from "@/components/InfiniteGalleries";

export const revalidate = 300;

interface Props {
  searchParams: Promise<{ category?: string }>;
}

export default async function HomePage({ searchParams }: Props) {
  const params = await searchParams;
  const category = params.category || undefined;
  const startOffset = getCachedStartOffset();

  let config = null;
  let featuredTags: { id: number; name: string; normalized_name: string }[] = [];
  let galleries = null;
  let categories: { name: string; gallery_count: number }[] = [];
  let error: string | null = null;

  try {
    const [cfg, tags, gals, cats] = await Promise.all([
      getSiteConfig(),
      getFeaturedTags(),
      getGalleries(12, startOffset, category),
      getCategories(),
    ]);
    config = cfg;
    featuredTags = tags.items || [];
    galleries = gals;
    categories = cats.items || [];
  } catch (e) {
    error = e instanceof Error ? e.message : "加载失败";
  }

  const featuredCategories = config?.featured_categories || [];
  const scale = config?.scale;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="mb-10 text-center">
        <h1 className="font-serif text-4xl font-medium tracking-tight text-white sm:text-5xl">
          <span className="text-[#c9a87c]">Veil</span> Gallery
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-white/50">
          现代时尚写真 · 瀑布流浏览 · 精选分类与标签
        </p>
        {scale && (
          <p className="mt-3 text-xs text-white/30">
            {scale.galleries.toLocaleString()} 图集 · {scale.images.toLocaleString()}{" "}
            图片 · {scale.tags.toLocaleString()} 标签
          </p>
        )}
      </section>

      {error && (
        <div className="mb-8 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-200">
          {error === "RATE_LIMIT"
            ? "源站接口限流，请稍后再试（约 30 分钟）"
            : `加载出错：${error}`}
        </div>
      )}

      {(featuredCategories.length > 0 || featuredTags.length > 0) && (
        <div className="mb-10">
          <FeaturedBar categories={featuredCategories} featuredTags={featuredTags} />
        </div>
      )}

      {categories.length > 0 && (
        <div className="mb-8 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs tracking-widest text-[#c9a87c]/70">筛选</span>
          <Link
            href="/"
            className={`rounded-full px-3 py-1.5 text-sm transition ${
              !category
                ? "bg-[#c9a87c]/20 text-[#e0c9a0] ring-1 ring-[#c9a87c]/40"
                : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            全部
          </Link>
          {categories.map((c) => (
            <Link
              key={c.name}
              href={`/?category=${encodeURIComponent(c.name)}`}
              className={`rounded-full px-3 py-1.5 text-sm transition ${
                category === c.name
                  ? "bg-[#c9a87c]/20 text-[#e0c9a0] ring-1 ring-[#c9a87c]/40"
                  : "bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      <section>
        <div className="mb-6 flex items-end justify-between">
          <h2 className="font-serif text-xl tracking-wide text-white/90">
            {category ? `${category} 图集` : "图集瀑布流"}
          </h2>
          <Link
            href="/galleries"
            className="text-sm text-[#c9a87c]/80 transition hover:text-[#e0c9a0]"
          >
            全部图集 →
          </Link>
        </div>
        {galleries && galleries.items.length > 0 ? (
          <InfiniteGalleries
            key={category || "all"}
            initial={galleries}
            category={category}
            pageSize={12}
          />
        ) : (
          !error && (
            <p className="py-20 text-center text-white/40">暂无可用图集</p>
          )
        )}
      </section>
    </div>
  );
}
