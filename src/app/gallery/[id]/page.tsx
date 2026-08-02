import Link from "next/link";
import { notFound } from "next/navigation";
import { getGallery } from "@/lib/api";
import GalleryImages from "@/components/GalleryImages";
import type { Metadata } from "next";

export const revalidate = 3600;

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const gallery = await getGallery(id);
    return {
      title: gallery.title || `图集 #${id}`,
      description: `${gallery.category || ""} · ${gallery.image_count} 张图片`,
    };
  } catch {
    return { title: "图集" };
  }
}

export default async function GalleryPage({ params }: Props) {
  const { id } = await params;
  let gallery = null;
  let error: string | null = null;

  try {
    gallery = await getGallery(id);
  } catch (caught) {
    if (caught instanceof Error && caught.message.includes("404")) notFound();
    error = caught instanceof Error ? caught.message : "加载失败";
  }

  if (!gallery && !error) notFound();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      {error && (
        <div className="mb-8 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">
          {error === "RATE_LIMIT"
            ? "接口限流或 IP 暂时被封，请稍后再试（约 30 分钟）。"
            : error}
        </div>
      )}

      {gallery && (
        <>
          <div className="mb-8">
            <Link
              href="/galleries"
              className="mb-4 inline-block text-sm text-white/40 transition hover:text-[#c9a87c]"
            >
              ← 返回图集列表
            </Link>
            <h1 className="font-serif text-2xl tracking-wide text-white sm:text-3xl">
              {gallery.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-white/50">
              {gallery.category && (
                <Link
                  href={`/galleries?category=${encodeURIComponent(
                    gallery.category
                  )}`}
                  className="rounded-full bg-white/5 px-3 py-1 hover:bg-white/10"
                >
                  {gallery.category}
                </Link>
              )}
              <span>
                {gallery.images.length} / {gallery.uploaded_images ?? gallery.image_count}{" "}
                张可用
              </span>
            </div>
          </div>

          <GalleryImages gallery={gallery} />
        </>
      )}
    </div>
  );
}
