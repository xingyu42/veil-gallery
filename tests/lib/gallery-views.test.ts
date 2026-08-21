import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRedis: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({ getRedis: mocks.getRedis }));

function recordingRedis() {
  const pipeline = {
    zincrby: vi.fn(),
    expire: vi.fn(),
    eval: vi.fn(),
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

    expect(redis.pipelineCommands.eval).toHaveBeenCalledWith(
      expect.stringContaining("cjson.decode"),
      ["gallery:info"],
      ["10088", expect.any(String)]
    );
    const payload = JSON.parse(
      redis.pipelineCommands.eval.mock.calls[0]?.[2]?.[1]
    );
    expect(payload).toEqual({
      title: "Gallery title",
      cover_id: 568250,
      category: "Category",
      image_count: 72,
      updated_at: expect.any(String),
    });
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

    const payload = JSON.parse(
      redis.pipelineCommands.eval.mock.calls[0]?.[2]?.[1]
    );
    expect(payload).not.toHaveProperty("cover_id");
  });

  it("loads ranked snapshots from the consolidated hash only", async () => {
    const boardPipeline = {
      zcard: vi.fn(),
      zrange: vi.fn(),
      exec: vi.fn().mockResolvedValue([2, ["10088", "10089"]]),
    };
    const hmget = vi.fn().mockResolvedValue({
      "10088": {
        title: "First",
        cover_id: 501,
        category: "A",
        image_count: 12,
        updated_at: "2026-08-22T00:00:00.000Z",
      },
      "10089": {
        title: "Second",
        cover_id: 502,
        category: "B",
        image_count: 24,
        updated_at: "2026-08-22T01:00:00.000Z",
      },
    });
    const redis = {
      pipeline: vi.fn(() => boardPipeline),
      hmget,
      hgetall: vi.fn(),
    };
    mocks.getRedis.mockReturnValue(redis);
    const { getPopularGalleries } = await import("@/lib/gallery-views");

    const page = await getPopularGalleries({ window: "all", limit: 2 });

    expect(hmget).toHaveBeenCalledWith("gallery:info", "10088", "10089");
    expect(redis.hgetall).not.toHaveBeenCalled();
    expect(page.items.map((item) => item.id)).toEqual([10088, 10089]);
  });
});
