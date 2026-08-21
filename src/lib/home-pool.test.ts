import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GalleryListItem } from "./types";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  isDisplayableGallery: vi.fn(() => true),
  getRedis: vi.fn(),
  resolveGalleryBoundary: vi.fn(),
  getErrorMessage: vi.fn((error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback
  ),
  getRateLimitResetMs: vi.fn(() => 0),
  isHardUpstreamFailure: vi.fn(() => false),
}));

vi.mock("./api", () => ({
  apiFetch: mocks.apiFetch,
  isDisplayableGallery: mocks.isDisplayableGallery,
}));
vi.mock("./redis", () => ({ getRedis: mocks.getRedis }));
vi.mock("./start-offset", () => ({
  resolveGalleryBoundary: mocks.resolveGalleryBoundary,
}));
vi.mock("./upstream-error", () => ({
  GALLERY_BOUNDARY_UNAVAILABLE: "GALLERY_BOUNDARY_UNAVAILABLE",
  getErrorMessage: mocks.getErrorMessage,
  getRateLimitResetMs: mocks.getRateLimitResetMs,
  isHardUpstreamFailure: mocks.isHardUpstreamFailure,
}));

const RECORD_KEY = "home:random-pool:v1";
const FAIL_KEY = `${RECORD_KEY}:fail`;

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

const items = Array.from({ length: 8 }, (_, index) => gallery(index + 1));

function redisWith(record: unknown, failed = false) {
  const failure = {
    message: "RATE_LIMIT",
    until: Date.now() + 30_000,
    retryAfterSeconds: 30,
  };
  return {
    get: vi.fn(async (key: string) => {
      if (key === RECORD_KEY) return record;
      if (key === FAIL_KEY) return failed ? failure : null;
      return null;
    }),
    set: vi
      .fn<(key: string, value: unknown, options?: unknown) => Promise<string>>()
      .mockResolvedValue("OK"),
    eval: vi
      .fn<(script: string, keys: string[], args: string[]) => Promise<number>>()
      .mockResolvedValue(1),
  };
}

async function loadPool() {
  vi.resetModules();
  delete (globalThis as typeof globalThis & {
    __veilGalleryHomePool?: unknown;
  }).__veilGalleryHomePool;
  vi.stubEnv("HOME_RANDOM_POOL_SIZE", "8");
  vi.stubEnv("HOME_RANDOM_POOL_TTL_SECONDS", "60");
  return import("./home-pool");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("home pool snapshots", () => {
  it("returns a fresh pool without rebuilding", async () => {
    mocks.getRedis.mockReturnValue(
      redisWith({ builtAt: Date.now(), items })
    );
    const { getHomePoolSnapshot } = await loadPool();

    await expect(getHomePoolSnapshot()).resolves.toEqual({
      status: "fresh",
      items,
    });
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("returns a stale pool without blocking on a rebuild", async () => {
    mocks.getRedis.mockReturnValue(
      redisWith({ builtAt: Date.now() - 61_000, items })
    );
    const { getHomePoolSnapshot } = await loadPool();

    await expect(getHomePoolSnapshot()).resolves.toEqual({
      status: "stale",
      items,
    });
    expect(mocks.resolveGalleryBoundary).not.toHaveBeenCalled();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("keeps a stale pool available when its background refresh fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getRedis.mockReturnValue(
      redisWith({ builtAt: Date.now() - 61_000, items })
    );
    mocks.resolveGalleryBoundary.mockResolvedValue({
      status: "ready",
      offset: 100,
      denseCount: 8,
    });
    mocks.apiFetch.mockRejectedValue(new Error("upstream unavailable"));
    const { getHomePoolSnapshot, refreshHomePool } = await loadPool();

    await expect(getHomePoolSnapshot()).resolves.toMatchObject({ status: "stale" });
    await expect(refreshHomePool()).resolves.toBe(false);
    await expect(getHomePoolSnapshot()).resolves.toEqual({
      status: "stale",
      items,
    });
    consoleError.mockRestore();
  });

  it("reports missing and failed pools separately", async () => {
    const redis = redisWith(null);
    mocks.getRedis.mockReturnValue(redis);
    let pool = await loadPool();

    await expect(pool.getHomePoolSnapshot()).resolves.toEqual({
      status: "missing",
      items: [],
    });

    redis.get.mockImplementation(async (key: string) =>
      key === FAIL_KEY
        ? {
            message: "RATE_LIMIT",
            until: Date.now() + 30_000,
            retryAfterSeconds: 30,
          }
        : null
    );
    pool = await loadPool();
    await expect(pool.getHomePoolSnapshot()).resolves.toEqual({
      status: "failed",
      items: [],
      error: "RATE_LIMIT",
      retryAfterSeconds: 30,
    });
  });

  it("bounds stale fallback retention to 24 hours after freshness", async () => {
    const redis = redisWith({
      builtAt: Date.now() - (23 * 60 * 60 * 1_000),
      items,
    });
    mocks.getRedis.mockReturnValue(redis);
    let pool = await loadPool();
    await expect(pool.getHomePoolSnapshot()).resolves.toMatchObject({
      status: "stale",
    });

    redis.get.mockImplementation(async (key: string) =>
      key === RECORD_KEY
        ? { builtAt: Date.now() - (25 * 60 * 60 * 1_000), items }
        : null
    );
    pool = await loadPool();
    await expect(pool.getHomePoolSnapshot()).resolves.toEqual({
      status: "missing",
      items: [],
    });
  });

  it("shares one in-process rebuild across concurrent refreshes", async () => {
    mocks.getRedis.mockReturnValue(null);
    mocks.resolveGalleryBoundary.mockResolvedValue({
      status: "ready",
      offset: 100,
      denseCount: 8,
    });
    let resolveFetch!: (value: { items: GalleryListItem[] }) => void;
    mocks.apiFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );
    const { refreshHomePool } = await loadPool();

    const first = refreshHomePool();
    const second = refreshHomePool();
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(1));
    resolveFetch({ items });

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(mocks.resolveGalleryBoundary).toHaveBeenCalledTimes(1);
  });

  it("persists a successful pool for freshness plus 24 stale hours", async () => {
    const redis = redisWith(null);
    mocks.getRedis.mockReturnValue(redis);
    mocks.resolveGalleryBoundary.mockResolvedValue({
      status: "ready",
      offset: 100,
      denseCount: 8,
    });
    mocks.apiFetch.mockResolvedValue({ items });
    const { refreshHomePool } = await loadPool();

    await expect(refreshHomePool()).resolves.toBe(true);
    const recordWrite = redis.set.mock.calls.find(([key]) => key === RECORD_KEY);
    expect(recordWrite?.[2]).toEqual({ px: 60_000 + 86_400_000 });
  });

  it("backs off in memory after a local build failure without Redis", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getRedis.mockReturnValue(null);
    mocks.resolveGalleryBoundary.mockResolvedValue({
      status: "ready",
      offset: 100,
      denseCount: 8,
    });
    mocks.apiFetch.mockRejectedValue(new Error("upstream unavailable"));
    const { getHomePoolSnapshot, refreshHomePool } = await loadPool();

    await expect(refreshHomePool()).resolves.toBe(false);
    await expect(getHomePoolSnapshot()).resolves.toEqual({
      status: "failed",
      items: [],
      error: "upstream unavailable",
      retryAfterSeconds: 60,
    });
    await expect(refreshHomePool()).resolves.toBe(false);
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
