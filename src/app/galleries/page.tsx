import { getGalleries } from "@/lib/api";
import { getStartOffset } from "@/lib/start-offset";
import InfiniteGalleries from "@/components/InfiniteGalleries";
import { describeUpstreamError, getErrorMessage } from "@/lib/upstream-error";
import { redirect } from "next/navigation";

// getStartOffset / Upstash rate-limit use no-store Redis REST; not ISR-compatible.
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ category?: string }>;
}

export default async function GalleriesPage({ searchParams }: Props) {
  const params = await searchParams;
  // Upstream /v1/galleries ignores category; drop legacy query to avoid sparse scans from 0.
  if (params.category?.trim()) {
    redirect("/galleries");
  }

  const startOffset = await getStartOffset();

  let data = null;
  let error: string | null = null;

  try {
    data = await getGalleries(12, startOffset);
  } catch (e) {
    error = getErrorMessage(e, "加载失败");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8">
        <h1 className="font-serif text-3xl tracking-wide text-foreground">图集</h1>
        <p className="mt-2 text-sm text-subtle">
          仅展示已上传图片的图集 · 下拉加载更多
        </p>
      </div>
      {error && (
        <div className="mb-8 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-status-warning">
          {describeUpstreamError(error, "源站限流中，请稍后再试")}
        </div>
      )}
      {data && (data.items.length > 0 || data.has_next) ? (
        <InfiniteGalleries initial={data} pageSize={12} />
      ) : (
        !error && <p className="py-20 text-center text-subtle">暂无可用图集</p>
      )}
    </div>
  );
}
