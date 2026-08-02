import Link from "next/link";
import TagPill from "./TagPill";
import type { FeaturedTag } from "@/lib/types";

interface Props {
  categories: string[];
  featuredTags: FeaturedTag[];
}

export default function FeaturedBar({ categories, featuredTags }: Props) {
  return (
    <section className="space-y-6">
      {categories.length > 0 && (
        <div>
          <h2 className="mb-3 font-serif text-sm tracking-widest text-[#c9a87c]/80">
            精选分类
          </h2>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <Link
                key={cat}
                href={`/?category=${encodeURIComponent(cat)}`}
                className="rounded-full bg-gradient-to-r from-[#c9a87c]/20 to-[#c9a87c]/5 px-4 py-2 text-sm font-medium text-[#e0c9a0] ring-1 ring-[#c9a87c]/30 transition hover:from-[#c9a87c]/30 hover:to-[#c9a87c]/10"
              >
                {cat}
              </Link>
            ))}
          </div>
        </div>
      )}

      {featuredTags.length > 0 && (
        <div>
          <h2 className="mb-3 font-serif text-sm tracking-widest text-[#c9a87c]/80">
            精选标签
          </h2>
          <div className="flex flex-wrap gap-2">
            {featuredTags.map((t) => (
              <TagPill key={t.id} name={t.name} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
