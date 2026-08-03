"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useTransition } from "react";

interface Props {
  categories: { name: string; gallery_count: number }[];
  currentCategory?: string;
  basePath?: string; // default /galleries
}

export default function FilterBar({
  categories,
  currentCategory,
  basePath = "/galleries",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const setCategory = useCallback(
    (cat: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (cat) {
        params.set("category", cat);
      } else {
        params.delete("category");
      }
      params.delete("page"); // reset page
      const qs = params.toString();
      startTransition(() => {
        router.push(`${basePath}${qs ? `?${qs}` : ""}`);
      });
    },
    [router, searchParams, basePath]
  );

  return (
    <div
      className={`mb-8 flex flex-wrap gap-2 transition-opacity ${
        isPending ? "opacity-60" : "opacity-100"
      }`}
    >
      <button
        type="button"
        onClick={() => setCategory(null)}
        className={`rounded-full px-3 py-1.5 text-sm transition ${
          !currentCategory
            ? "bg-accent/10 text-accent ring-1 ring-accent/40"
            : "bg-card text-muted hover:bg-card"
        }`}
      >
        全部
      </button>
      {categories.map((c) => (
        <button
          key={c.name}
          type="button"
          onClick={() => setCategory(c.name)}
          className={`rounded-full px-3 py-1.5 text-sm transition ${
            currentCategory === c.name
              ? "bg-accent/10 text-accent ring-1 ring-accent/40"
              : "bg-card text-muted hover:bg-card"
          }`}
        >
          {c.name}
          <span className="ml-1 text-xs opacity-50">{c.gallery_count}</span>
        </button>
      ))}
    </div>
  );
}
