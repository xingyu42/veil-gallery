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
          <h2 className="mb-3 font-serif text-sm tracking-widest text-accent">
            精选分类
          </h2>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <Link
                key={cat}
                href={`/galleries?category=${encodeURIComponent(cat)}`}
                className="rounded-full bg-accent/10 px-4 py-2 text-sm font-medium text-accent ring-1 ring-accent/30 transition hover:ring-accent/70"
              >
                {cat}
              </Link>
            ))}
          </div>
        </div>
      )}

      {featuredTags.length > 0 && (
        <div>
          <h2 className="mb-3 font-serif text-sm tracking-widest text-accent">
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
