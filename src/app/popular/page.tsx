import Link from "next/link";
import type { Metadata } from "next";
import {
  getPopularGalleries,
  POPULAR_WINDOWS,
  type PopularWindow,
} from "@/lib/gallery-views";
import InfinitePopular from "@/components/InfinitePopular";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "热门图集",
};

const PAGE_SIZE = 12;

const TABS: { key: PopularWindow; label: string }[] = [
  { key: "day", label: "今日" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
  { key: "all", label: "总榜" },
];

const EMPTY_HINT: Record<PopularWindow, string> = {
  day: "今日还没有浏览数据，逛逛图集点亮榜单",
  week: "本周还没有浏览数据",
  month: "本月还没有浏览数据",
  all: "暂无热门数据，浏览图集详情后会陆续出现",
};

interface Props {
  searchParams: Promise<{ window?: string }>;
}

export default async function PopularPage({ searchParams }: Props) {
  const raw = (await searchParams).window ?? "day";
  const window: PopularWindow = POPULAR_WINDOWS.includes(
    raw as PopularWindow
  )
    ? (raw as PopularWindow)
    : "day";

  const initial = await getPopularGalleries({
    window,
    limit: PAGE_SIZE,
    offset: 0,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8">
        <p className="mb-2 text-[10px] tracking-[0.3em] text-accent">TRENDING</p>
        <h1 className="font-serif text-3xl tracking-wide text-foreground">
          热门图集
        </h1>
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const active = tab.key === window;
          return (
            <Link
              key={tab.key}
              href={tab.key === "day" ? "/popular" : `/popular?window=${tab.key}`}
              className={
                active
                  ? "rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground"
                  : "rounded-full border border-border px-4 py-1.5 text-sm text-muted transition hover:border-accent/50 hover:text-accent"
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {initial.items.length > 0 ? (
        <InfinitePopular
          key={window}
          initial={initial}
          window={window}
          pageSize={PAGE_SIZE}
        />
      ) : (
        <p className="py-20 text-center text-subtle">{EMPTY_HINT[window]}</p>
      )}
    </div>
  );
}
