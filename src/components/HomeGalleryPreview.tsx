"use client";

import { startTransition, useEffect, useState } from "react";

import GalleryCard from "./GalleryCard";
import type { GalleryListItem } from "@/lib/types";
import { describeUpstreamError } from "@/lib/upstream-error";

const POLL_INTERVAL_MS = 2_000;
const LOAD_TIMEOUT_MS = 180_000;
const GRID_CLASS =
  "grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";

type PreviewState =
  | { status: "loading" }
  | { status: "ready"; items: GalleryListItem[] }
  | { status: "error"; message: string };

function PreviewSkeleton() {
  return (
    <div
      aria-label="首页图集准备中"
      className={GRID_CLASS}
    >
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="aspect-[3/4] animate-pulse rounded-lg bg-placeholder ring-1 ring-border"
        />
      ))}
    </div>
  );
}

export default function HomeGalleryPreview() {
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let completed = false;
    const loadTimer = setTimeout(() => {
      if (completed) return;
      controller.abort();
      setState({ status: "error", message: "首页图集准备超时" });
    }, LOAD_TIMEOUT_MS);

    async function loadPreview() {
      try {
        const response = await fetch("/api/home-preview", {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as {
          status?: "ready" | "stale" | "building";
          items?: GalleryListItem[];
          error?: string;
        };

        if (response.status === 202 && body.status === "building") {
          const retryAfterHeader = response.headers.get("Retry-After");
          const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : NaN;
          const delay = Number.isFinite(retryAfter)
            ? Math.max(1, retryAfter) * 1_000
            : POLL_INTERVAL_MS;
          pollTimer = setTimeout(loadPreview, delay);
          return;
        }

        if (!response.ok || !Array.isArray(body.items)) {
          throw new Error(body.error || "首页图集加载失败");
        }

        startTransition(() => {
          setState({ status: "ready", items: body.items! });
        });
        completed = true;
        clearTimeout(loadTimer);
      } catch (error) {
        if (controller.signal.aborted) return;
        completed = true;
        clearTimeout(loadTimer);
        const message = error instanceof Error ? error.message : "首页图集加载失败";
        setState({
          status: "error",
          message: describeUpstreamError(
            message,
            "源站接口限流，请稍后再试（约 30 分钟）"
          ),
        });
      }
    }

    void loadPreview();
    return () => {
      controller.abort();
      clearTimeout(loadTimer);
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [attempt]);

  if (state.status === "loading") return <PreviewSkeleton />;

  if (state.status === "error") {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-8 text-center">
        <p className="text-sm text-status-warning">{state.message}</p>
        <button
          type="button"
          onClick={() => {
            setState({ status: "loading" });
            setAttempt((value) => value + 1);
          }}
          className="mt-4 rounded-full border border-border px-4 py-2 text-sm text-muted transition hover:border-accent/50 hover:text-accent"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className={GRID_CLASS}>
      {state.items.map((gallery) => (
        <GalleryCard key={gallery.id} gallery={gallery} />
      ))}
    </div>
  );
}
