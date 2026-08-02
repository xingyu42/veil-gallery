"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { Paginated, TagItem } from "@/lib/types";

const CHUNK_SIZE = 120;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

type SortMode = "count" | "alpha";

function bucketOf(name: string): string {
  const first = Array.from(name.trim())[0] || "";
  if (/[a-z]/i.test(first)) return first.toUpperCase();
  if (/[0-9]/.test(first)) return "0-9";
  return "其他";
}

function bucketId(bucket: string): string {
  return `tags-bucket-${bucket === "其他" ? "other" : bucket}`;
}

function sizeForCount(count: number, maxCount: number): number {
  const ratio = Math.log(Math.max(0, count) + 1) / Math.log(maxCount + 1);
  return Number((0.8 + 0.8 * ratio).toFixed(2));
}

export default function TagsCloud() {
  const [items, setItems] = useState<TagItem[]>([]);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("count");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadTags() {
      try {
        const response = await fetch("/api/tags", { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = (await response.json()) as Paginated<TagItem>;
        if (active) setItems(Array.isArray(data.items) ? data.items : []);
      } catch (loadError) {
        if (active && !(loadError instanceof DOMException && loadError.name === "AbortError")) {
          setError("标签加载失败，请稍后再试。");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadTags();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const view = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase();
    const filtered = normalizedQuery
      ? items.filter(
          (tag) =>
            tag.name.toLocaleLowerCase().includes(normalizedQuery) ||
            tag.normalized_name.toLocaleLowerCase().includes(normalizedQuery)
        )
      : [...items];

    filtered.sort((a, b) =>
      sortMode === "alpha"
        ? a.name.localeCompare(b.name)
        : b.gallery_count - a.gallery_count || a.name.localeCompare(b.name)
    );

    const presentBuckets = new Set(filtered.map((tag) => bucketOf(tag.name)));
    const buckets = LETTERS.filter((letter) => presentBuckets.has(letter));
    if (presentBuckets.has("0-9")) buckets.push("0-9");
    if (presentBuckets.has("其他")) buckets.push("其他");

    const anchorByTagId = new Map<number, string>();
    const anchoredBuckets = new Set<string>();
    for (const tag of filtered) {
      const bucket = bucketOf(tag.name);
      if (!anchoredBuckets.has(bucket)) {
        anchorByTagId.set(tag.id, bucketId(bucket));
        anchoredBuckets.add(bucket);
      }
    }

    const chunks: TagItem[][] = [];
    for (let index = 0; index < filtered.length; index += CHUNK_SIZE) {
      chunks.push(filtered.slice(index, index + CHUNK_SIZE));
    }

    return {
      anchorByTagId,
      buckets,
      chunks,
      filteredCount: filtered.length,
      maxCount: Math.max(...filtered.map((tag) => tag.gallery_count), 1),
    };
  }, [deferredQuery, items, sortMode]);

  if (loading) {
    return (
      <p
        className="py-16 text-center text-sm text-[color:var(--muted)]"
        aria-live="polite"
      >
        正在加载标签…
      </p>
    );
  }

  if (error) {
    return (
      <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-status-danger">
        {error}
      </div>
    );
  }

  return (
    <>
      <p
        className="mt-1 text-[0.86rem] text-[color:var(--muted)]"
        aria-live="polite"
      >
        共 {items.length.toLocaleString()} 个标签 · 当前显示{" "}
        {view.filteredCount.toLocaleString()} 个
      </p>

      <div className="my-5 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索标签名称..."
          aria-label="搜索标签名称"
          className="min-w-[200px] flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-3.5 py-2.5 text-sm text-foreground placeholder:text-[color:var(--muted)] focus:border-accent"
        />
        <select
          value={sortMode}
          onChange={(event) => setSortMode(event.target.value as SortMode)}
          aria-label="标签排序方式"
          className="rounded-lg border border-[color:var(--border)] bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-accent"
        >
          <option value="count">按图集数排序</option>
          <option value="alpha">按字母排序</option>
        </select>
      </div>

      {view.buckets.length > 0 && (
        <nav
          className="my-4 flex flex-wrap gap-1 text-[0.78rem]"
          aria-label="标签首字母索引"
        >
          {view.buckets.map((bucket) => (
            <a
              key={bucket}
              href={`#${bucketId(bucket)}`}
              className="rounded px-2 py-0.5 text-[color:var(--muted)] transition hover:bg-[color:var(--card)] hover:text-accent"
            >
              {bucket}
            </a>
          ))}
        </nav>
      )}

      {view.filteredCount > 0 ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 leading-[1.8]">
          {view.chunks.map((chunk, chunkIndex) => (
            <section
              key={`${chunk[0].id}-${chunkIndex}`}
              className="mb-[18px] w-full"
              style={{
                contentVisibility: "auto",
                containIntrinsicSize: "auto 240px",
              }}
            >
              <h2 className="mb-1.5 text-[0.74rem] font-normal uppercase tracking-[0.1em] text-[color:var(--muted)]">
                {bucketOf(chunk[0].name)} · {chunk.length}
              </h2>
              {chunk.map((tag) => (
                <a
                  key={tag.id}
                  id={view.anchorByTagId.get(tag.id)}
                  href={`/tag/${encodeURIComponent(tag.name)}`}
                  title={`${tag.name} · ${tag.gallery_count.toLocaleString()} 个图集`}
                  className="inline-block scroll-mt-20 rounded px-1.5 py-0.5 text-foreground transition hover:bg-[color:var(--card)] hover:text-accent"
                  style={{ fontSize: `${sizeForCount(tag.gallery_count, view.maxCount)}em` }}
                >
                  <span>{tag.name}</span>
                  <span className="ml-[3px] text-[0.72em] text-[color:var(--muted)]">
                    {tag.gallery_count}
                  </span>
                </a>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <p className="py-16 text-center text-[color:var(--muted)]">
          未找到匹配的标签。
        </p>
      )}
    </>
  );
}
