import { after, NextResponse } from "next/server";

import {
  getHomePoolSnapshot,
  refreshHomePool,
} from "@/lib/home-pool";
import type { GalleryListItem } from "@/lib/types";
import { upstreamJsonError } from "@/lib/upstream-error";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const PREVIEW_COUNT = 8;
const NO_STORE = { "Cache-Control": "no-store" } as const;

function pickRandom<T>(items: T[], count: number): T[] {
  const want = Math.min(count, items.length);
  const shuffled = items.slice();
  for (let index = 0; index < want; index++) {
    const picked = index + Math.floor(Math.random() * (shuffled.length - index));
    [shuffled[index], shuffled[picked]] = [shuffled[picked], shuffled[index]];
  }
  return shuffled.slice(0, want);
}

function scheduleRefresh(): void {
  after(async () => {
    try {
      await refreshHomePool();
    } catch (error) {
      console.error("[home-preview] Background refresh failed:", error);
    }
  });
}

export async function GET() {
  try {
    const snapshot = await getHomePoolSnapshot();
    if (snapshot.status === "fresh" || snapshot.status === "stale") {
      if (snapshot.status === "stale") scheduleRefresh();
      return NextResponse.json(
        {
          status: snapshot.status === "fresh" ? "ready" : "stale",
          items: pickRandom<GalleryListItem>(snapshot.items, PREVIEW_COUNT),
        },
        { headers: NO_STORE }
      );
    }

    if (snapshot.status === "failed") {
      const response = upstreamJsonError(new Error(snapshot.error), 503);
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("Retry-After", String(snapshot.retryAfterSeconds));
      return response;
    }

    scheduleRefresh();
    return NextResponse.json(
      { status: "building", items: [] },
      {
        status: 202,
        headers: { ...NO_STORE, "Retry-After": "2" },
      }
    );
  } catch (error) {
    const response = upstreamJsonError(error, 500, "首页图集加载失败");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
