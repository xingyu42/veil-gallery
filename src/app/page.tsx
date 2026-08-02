import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getSiteConfig,
  getFeaturedTags,
  getGalleries,
} from "@/lib/api";
import { getCachedStartOffset } from "@/lib/start-offset";
import { describeUpstreamError, getErrorMessage } from "@/lib/upstream-error";
import FeaturedBar from "@/components/FeaturedBar";
import GalleryCard from "@/components/GalleryCard";
import Masonry from "@/components/Masonry";

export const revalidate = 300;

interface Props {
  searchParams: Promise<{ category?: string }>;
}

export default async function HomePage({ searchParams }: Props) {
  const params = await searchParams;
  const legacyCategory = params.category?.trim();

  if (legacyCategory) {
    redirect(`/galleries?category=${encodeURIComponent(legacyCategory)}`);
  }

  const startOffset = getCachedStartOffset();

  let config = null;
  let featuredTags: { id: number; name: string; normalized_name: string }[] = [];
  let galleries = null;
  let error: string | null = null;

  try {
    const [cfg, tags, gals] = await Promise.all([
      getSiteConfig(),
      getFeaturedTags(),
      getGalleries(12, startOffset),
    ]);
    config = cfg;
    featuredTags = tags.items || [];
    galleries = gals;
  } catch (e) {
    error = getErrorMessage(e, "加载失败");
  }

  const featuredCategories = config?.featured_categories || [];
  const scale = config?.scale;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="relative mb-12 overflow-hidden border-y border-white/10 py-12 text-center sm:py-16">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,var(--hero-glow),transparent_58%)]" />
        <p className="relative mb-4 text-[10px] tracking-[0.4em] text-accent">
          CURATED PHOTOGRAPHY
        </p>
        <h1 className="relative font-serif text-4xl font-medium tracking-tight text-white sm:text-6xl">
          <span className="text-accent">Veil</span> Gallery
        </h1>
        <p className="relative mx-auto mt-4 max-w-2xl text-base leading-7 text-white/50">
          现代时尚写真 · 精选分类与标签
        </p>
        {scale && (
          <p className="relative mt-4 text-xs text-white/30">
            {scale.galleries.toLocaleString()} 图集 · {scale.images.toLocaleString()}{" "}
            图片 · {scale.tags.toLocaleString()} 标签
          </p>
        )}
        <div className="relative mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href="/galleries"
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition hover:brightness-110"
          >
            浏览全部图集
          </Link>
          <Link
            href="/tags"
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/70 transition hover:border-accent/50 hover:text-accent"
          >
            按标签发现
          </Link>
        </div>
      </section>

      {error && (
        <div className="mb-8 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-status-warning">
          {describeUpstreamError(
            error,
            "源站接口限流，请稍后再试（约 30 分钟）"
          )}
        </div>
      )}

      {(featuredCategories.length > 0 || featuredTags.length > 0) && (
        <div className="mb-10">
          <FeaturedBar categories={featuredCategories} featuredTags={featuredTags} />
        </div>
      )}

      <section>
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-[10px] tracking-[0.3em] text-accent">
              A PLACE TO BEGIN
            </p>
            <h2 className="font-serif text-2xl tracking-wide text-white/90">
              从这些图集开始
            </h2>
          </div>
          <Link
            href="/galleries"
            className="shrink-0 text-sm text-accent transition hover:text-accent"
          >
            全部图集 →
          </Link>
        </div>
        {galleries && galleries.items.length > 0 ? (
          <Masonry>
            {galleries.items.slice(0, 6).map((gallery) => (
              <GalleryCard key={gallery.id} gallery={gallery} />
            ))}
          </Masonry>
        ) : (
          !error && (
            <p className="py-20 text-center text-white/40">暂无可用图集</p>
          )
        )}
      </section>
    </div>
  );
}
