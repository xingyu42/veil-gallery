import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSiteConfig, getFeaturedTags } from "@/lib/api";
import FeaturedBar from "@/components/FeaturedBar";
import HomeGalleryPreview from "@/components/HomeGalleryPreview";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

interface Props {
  searchParams: Promise<{ category?: string }>;
}

async function SiteScale() {
  try {
    const config = await getSiteConfig();
    const scale = config.scale;
    return (
      <p className="relative mt-4 text-xs text-subtle">
        {scale.galleries.toLocaleString()} 图集 · {scale.images.toLocaleString()} 图片 ·{" "}
        {scale.tags.toLocaleString()} 标签
      </p>
    );
  } catch (error) {
    console.error("[home] Site config unavailable:", error);
    return null;
  }
}

async function FeaturedTagsSection() {
  try {
    const tags = await getFeaturedTags();
    if (!tags.items?.length) return null;
    return (
      <div className="mb-10">
        <FeaturedBar featuredTags={tags.items} />
      </div>
    );
  } catch (error) {
    console.error("[home] Featured tags unavailable:", error);
    return null;
  }
}

export default async function HomePage({ searchParams }: Props) {
  const params = await searchParams;
  // Legacy category links no longer filter; send to plain galleries list.
  if (params.category?.trim()) {
    redirect("/galleries");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="relative mb-12 overflow-hidden border-y border-border py-12 text-center sm:py-16">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,var(--hero-glow),transparent_58%)]" />
        <p className="relative mb-4 text-[10px] tracking-[0.4em] text-accent">
          CURATED PHOTOGRAPHY
        </p>
        <h1 className="relative font-serif text-4xl font-medium tracking-tight text-foreground sm:text-6xl">
          <span className="text-accent">Veil</span> Gallery
        </h1>
        <p className="relative mx-auto mt-4 max-w-2xl text-base leading-7 text-muted">
          现代时尚写真 · 精选标签发现
        </p>
        <Suspense fallback={null}>
          <SiteScale />
        </Suspense>
        <div className="relative mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href="/galleries"
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition hover:brightness-110"
          >
            浏览全部图集
          </Link>
          <Link
            href="/tags"
            className="rounded-full border border-border px-5 py-2.5 text-sm text-muted transition hover:border-accent/50 hover:text-accent"
          >
            按标签发现
          </Link>
        </div>
      </section>

      <Suspense fallback={null}>
        <FeaturedTagsSection />
      </Suspense>

      <section>
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-[10px] tracking-[0.3em] text-accent">
              A PLACE TO BEGIN
            </p>
            <h2 className="font-serif text-2xl tracking-wide text-foreground">
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
        <HomeGalleryPreview />
      </section>
    </div>
  );
}
