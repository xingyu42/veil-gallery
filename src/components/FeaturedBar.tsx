import TagPill from "./TagPill";
import type { FeaturedTag } from "@/lib/types";

interface Props {
  featuredTags: FeaturedTag[];
}

export default function FeaturedBar({ featuredTags }: Props) {
  if (featuredTags.length === 0) return null;

  return (
    <section className="space-y-6">
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
    </section>
  );
}
