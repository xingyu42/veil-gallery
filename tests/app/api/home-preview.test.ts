import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GalleryListItem } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  getHomePoolSnapshot: vi.fn(),
  refreshHomePool: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const original = await importOriginal<typeof import("next/server")>();
  return { ...original, after: mocks.after };
});
vi.mock("@/lib/home-pool", () => ({
  getHomePoolSnapshot: mocks.getHomePoolSnapshot,
  refreshHomePool: mocks.refreshHomePool,
}));

import { GET } from "@/app/api/home-preview/route";

function gallery(id: number): GalleryListItem {
  return {
    id,
    title: `Gallery ${id}`,
    series_number: null,
    category: "Test",
    image_count: 12,
    status: "ready",
    updated_at: "2026-08-21T00:00:00.000Z",
    cover: null,
  };
}

const items = Array.from({ length: 12 }, (_, index) => gallery(index + 1));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.refreshHomePool.mockResolvedValue(true);
});

describe("GET /api/home-preview", () => {
  it("returns at most eight items from a fresh pool", async () => {
    mocks.getHomePoolSnapshot.mockResolvedValue({ status: "fresh", items });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.status).toBe("ready");
    expect(body.items).toHaveLength(8);
    expect(new Set(body.items.map((item: GalleryListItem) => item.id)).size).toBe(8);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("returns stale items immediately and schedules a refresh", async () => {
    mocks.getHomePoolSnapshot.mockResolvedValue({ status: "stale", items });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("stale");
    expect(mocks.after).toHaveBeenCalledTimes(1);
    const task = mocks.after.mock.calls[0][0] as () => Promise<void>;
    await task();
    expect(mocks.refreshHomePool).toHaveBeenCalledTimes(1);
  });

  it("returns building immediately and schedules the first build", async () => {
    mocks.getHomePoolSnapshot.mockResolvedValue({ status: "missing", items: [] });

    const response = await GET();

    expect(response.status).toBe(202);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Retry-After")).toBe("2");
    await expect(response.json()).resolves.toEqual({
      status: "building",
      items: [],
    });
    expect(mocks.after).toHaveBeenCalledTimes(1);
  });

  it("returns 503 while a recent build failure is active", async () => {
    mocks.getHomePoolSnapshot.mockResolvedValue({
      status: "failed",
      items: [],
      error: "HOME_POOL_BUILD_RECENTLY_FAILED",
      retryAfterSeconds: 60,
    });

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Retry-After")).toBe("60");
    await expect(response.json()).resolves.toEqual({
      error: "HOME_POOL_BUILD_RECENTLY_FAILED",
    });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("preserves rate-limit status and retry timing from a failed build", async () => {
    mocks.getHomePoolSnapshot.mockResolvedValue({
      status: "failed",
      items: [],
      error: "RATE_LIMIT",
      retryAfterSeconds: 30,
    });

    const response = await GET();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    await expect(response.json()).resolves.toEqual({ error: "RATE_LIMIT" });
  });
});
