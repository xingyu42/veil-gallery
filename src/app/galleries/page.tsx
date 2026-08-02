import Link from "next/link";
import { getGalleries, getCategories } from "@/lib/api";
import { getCachedStartOffset } from "@/lib/start-offset";
import InfiniteGalleries from "@/components/InfiniteGalleries";
import { describeUpstreamError, getErrorMessage } from "@/lib/upstream-error";

export const revalidate = 300;

interface Props {
  searchParams: Promise<{ category?: string }>;
}

export default async function GalleriesPage({ searchParams }: Props) {
  const params = await searchParams;
  const category = params.category || undefined;
  const startOffset = getCachedStartOffset();

  let data = null;
  let categories: { name: string; gallery_count: number }[] = [];
  let error: string | null = null;

  try {
    const [gals, cats] = await Promise.all([
      getGalleries(12, startOffset, category),
      getCategories(),
    ]);
    data = gals;
    categories = cats.items || [];
  } catch (e) {
    error = getErrorMessage(e, "加载失败");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8">
        <h1 className="font-serif text-3xl tracking-wide text-white">
          图集
          {category && (
            <span className="ml-3 text-lg text-accent">· {category}</span>
          )}
        </h1>
        <p className="mt-2 text-sm text-white/40">
          仅展示已上传图片的图集 · 下拉加载更多
        </p>
      </div>
      <div className="mb-8 flex flex-wrap gap-2">
        <Link
          href="/galleries"
          className={`rounded-full px-3 py-1.5 text-sm transition ${
            !category
              ? "bg-accent/10 text-accent ring-1 ring-accent/40"
              : "bg-white/5 text-white/60 hover:bg-white/10"
          }`}
        >
          全部
        </Link>
        {categories.map((c) => (
          <Link
            key={c.name}
            href={`/galleries?category=${encodeURIComponent(c.name)}`}
            className={`rounded-full px-3 py-1.5 text-sm transition ${
              category === c.name
                ? "bg-accent/10 text-accent ring-1 ring-accent/40"
                : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            {c.name}
            <span className="ml-1 text-xs opacity-50">
              {c.gallery_count.toLocaleString()}
            </span>
          </Link>
        ))}
      </div>
      {error && (
        <div className="mb-8 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-status-warning">
          {describeUpstreamError(error, "源站限流中，请稍后再试")}
        </div>
      )}
      {data && data.items.length > 0 ? (
        <InfiniteGalleries
          key={category || "all"}
          initial={data}
          category={category}
          pageSize={12}
        />
      ) : (
        !error && <p className="py-20 text-center text-white/40">暂无可用图集</p>
      )}
    </div>
  );
}
