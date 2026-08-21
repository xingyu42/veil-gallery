import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRedis: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({ getRedis: mocks.getRedis }));

function recordingRedis() {
  const pipeline = {
    zincrby: vi.fn(),
    expire: vi.fn(),
    hset: vi.fn(),
    exec: vi.fn().mockResolvedValue([]),
  };
  return {
    pipeline: vi.fn(() => pipeline),
    pipelineCommands: pipeline,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("gallery info storage", () => {
  it("writes a gallery snapshot into the consolidated hash", async () => {
    const redis = recordingRedis();
    mocks.getRedis.mockReturnValue(redis);
    const { recordGalleryView } = await import("@/lib/gallery-views");

    await recordGalleryView({
      id: 10088,
      title: "Gallery title",
      coverId: 568250,
      category: "Category",
      imageCount: 72,
    });

    expect(redis.pipelineCommands.hset).toHaveBeenCalledWith(
      "gallery:info",
      expect.objectContaining({
        "10088:title": "Gallery title",
        "10088:cover_id": "568250",
        "10088:category": "Category",
        "10088:image_count": "72",
        "10088:updated_at": expect.any(String),
      })
    );
    expect(redis.pipelineCommands.hset).not.toHaveBeenCalledWith(
      "gallery:info:10088",
      expect.anything()
    );
  });

  it("does not overwrite a stored cover with zero", async () => {
    const redis = recordingRedis();
    mocks.getRedis.mockReturnValue(redis);
    const { recordGalleryView } = await import("@/lib/gallery-views");

    await recordGalleryView({
      id: 10088,
      title: "Gallery title",
      coverId: 0,
      category: null,
      imageCount: 72,
    });

    const fields = redis.pipelineCommands.hset.mock.calls[0]?.[1];
    expect(fields).not.toHaveProperty("10088:cover_id");
  });

  it("loads ranked snapshots from the consolidated hash only", async () => {
    const boardPipeline = {
      zcard: vi.fn(),
      zrange: vi.fn(),
      exec: vi.fn().mockResolvedValue([2, ["10088", "10089"]]),
    };
    const hmget = vi.fn().mockResolvedValue({
      "10088:title": "First",
      "10088:cover_id": "501",
      "10088:category": "A",
      "10088:image_count": "12",
      "10088:updated_at": "2026-08-22T00:00:00.000Z",
      "10089:title": "Second",
      "10089:cover_id": "502",
      "10089:category": "B",
      "10089:image_count": "24",
      "10089:updated_at": "2026-08-22T01:00:00.000Z",
    });
    const redis = {
      pipeline: vi.fn(() => boardPipeline),
      hmget,
      hgetall: vi.fn(),
    };
    mocks.getRedis.mockReturnValue(redis);
    const { getPopularGalleries } = await import("@/lib/gallery-views");

    const page = await getPopularGalleries({ window: "all", limit: 2 });

    expect(hmget).toHaveBeenCalledWith(
      "gallery:info",
      "10088:title",
      "10088:cover_id",
      "10088:category",
      "10088:image_count",
      "10088:updated_at",
      "10089:title",
      "10089:cover_id",
      "10089:category",
      "10089:image_count",
      "10089:updated_at"
    );
    expect(redis.hgetall).not.toHaveBeenCalled();
    expect(page.items.map((item) => item.id)).toEqual([10088, 10089]);
  });
});
