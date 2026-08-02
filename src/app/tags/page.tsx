import Link from "next/link";
import { getTags } from "@/lib/api";
import TagPill from "@/components/TagPill";

export const revalidate = 900;

interface Props {
  searchParams: Promise<{ page?: string; q?: string }>;
}

export default async function TagsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const q = (params.q || "").trim().toLowerCase();
  const limit = 60;
  const offset = (page - 1) * limit;

  let data = null;
  let error: string | null = null;

  try {
    data = await getTags(limit, offset);
  } catch (e) {
    error = e instanceof Error ? e.message : "加载失败";
  }

  // Client-side-ish filter on current page (API doesn't seem to support search)
  const items = data?.items
    ? q
      ? data.items.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            t.normalized_name.toLowerCase().includes(q)
        )
      : data.items
    : [];

  const totalPages = data
    ? Math.ceil(data.total / limit)
    : 1;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8">
        <h1 className="font-serif text-3xl tracking-wide text-white">标签</h1>
        <p className="mt-2 text-sm text-white/40">
          共 {data?.total?.toLocaleString() ?? "—"} 个公开标签
        </p>
      </div>

      {/* Search form (GET) */}
      <form className="mb-8 flex max-w-md gap-2" action="/tags" method="get">
        <input
          type="search"
          name="q"
          defaultValue={params.q || ""}
          placeholder="搜索标签…"
          className="flex-1 rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-[#c9a87c]/50 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-full bg-[#c9a87c]/20 px-5 py-2.5 text-sm text-[#e0c9a0] ring-1 ring-[#c9a87c]/30 transition hover:bg-[#c9a87c]/30"
        >
          搜索
        </button>
      </form>

      {error && (
        <div className="mb-8 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">
          {error === "RATE_LIMIT" ? "接口限流中，请稍后再试" : error}
        </div>
      )}

      {items.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-2.5">
            {items.map((t) => (
              <TagPill
                key={t.id}
                name={t.name}
                count={t.gallery_count}
              />
            ))}
          </div>

          {!q && (
            <div className="mt-12 flex items-center justify-center gap-4">
              {page > 1 && (
                <Link
                  href={`/tags?page=${page - 1}`}
                  className="rounded-full border border-white/20 px-5 py-2 text-sm text-white/70 transition hover:border-[#c9a87c]/50 hover:text-[#c9a87c]"
                >
                  ← 上一页
                </Link>
              )}
              <span className="text-sm text-white/40">
                {page} / {totalPages}
              </span>
              {page < totalPages && (
                <Link
                  href={`/tags?page=${page + 1}`}
                  className="rounded-full border border-white/20 px-5 py-2 text-sm text-white/70 transition hover:border-[#c9a87c]/50 hover:text-[#c9a87c]"
                >
                  下一页 →
                </Link>
              )}
            </div>
          )}
        </>
      ) : (
        !error && (
          <p className="py-20 text-center text-white/40">
            {q ? "没有匹配的标签" : "暂无标签"}
          </p>
        )
      )}
    </div>
  );
}
