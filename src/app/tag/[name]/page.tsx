import Link from "next/link";
import { getTagPreview } from "@/lib/api";
import TagPreviewImages from "@/components/TagPreviewImages";
import type { Metadata } from "next";
import { describeUpstreamError, getErrorMessage } from "@/lib/upstream-error";

export const revalidate = 1800;

interface Props {
  params: Promise<{ name: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const decoded = decodeURIComponent(name);
  return {
    title: `#${decoded}`,
    description: `标签 ${decoded} 下的精选图片预览`,
  };
}

export default async function TagPage({ params }: Props) {
  const { name } = await params;
  const decoded = decodeURIComponent(name);

  let imageIds: number[] = [];
  let error: string | null = null;

  try {
    const res = await getTagPreview(decoded);
    imageIds = res.image_ids || [];
  } catch (e) {
    error = getErrorMessage(e, "加载失败");
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8">
        <Link
          href="/tags"
          className="mb-4 inline-block text-sm text-white/40 transition hover:text-accent"
        >
          ← 返回标签列表
        </Link>
        <h1 className="font-serif text-3xl tracking-wide text-white">
          <span className="text-accent">#</span>
          {decoded}
        </h1>
        <p className="mt-2 text-sm text-white/40">
          随机预览最多 6 张图片（API 限制）· 点击图片查看元数据
        </p>
      </div>

      {error && (
        <div className="mb-8 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-status-danger">
          {describeUpstreamError(error, "此接口限流较严，请稍后再试")}
        </div>
      )}

      {imageIds.length > 0 ? (
        <TagPreviewImages imageIds={imageIds} tagName={decoded} />
      ) : (
        !error && (
          <p className="py-20 text-center text-white/40">该标签暂无预览图片</p>
        )
      )}
    </div>
  );
}
