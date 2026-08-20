import { describe, expect, it, vi } from "vitest";
import {
  fetchImageUpstream,
  ImageUpstreamFetchError,
  resolveImageUpstreamTarget,
} from "./image-upstream";

const allowed = () => Promise.resolve({ allowed: true, limit: 300, resetMs: 0 });

function response(status: number, headers?: HeadersInit): Response {
  return new Response(status === 200 ? "image" : null, { status, headers });
}

function resinTarget() {
  return resolveImageUpstreamTarget(
    "42",
    "https://resin.example.com/secret/Default/https/veil.ortlinde.com"
  );
}

describe("resolveImageUpstreamTarget", () => {
  it("uses the canonical upstream when Resin is not configured", () => {
    expect(resolveImageUpstreamTarget("42", "")).toEqual({
      resinEnabled: false,
      url: "https://veil.ortlinde.com/v1/image/42",
    });
  });

  it("appends the canonical image path to the Resin reverse proxy", () => {
    expect(resinTarget()).toEqual({
      resinEnabled: true,
      url: "https://resin.example.com/secret/Default/https/veil.ortlinde.com/v1/image/42",
    });
  });

  it("normalizes Resin's dot identity before fetch can remove it", () => {
    const target = resolveImageUpstreamTarget(
      "42",
      "https://resin.example.com/secret/./https/veil.ortlinde.com"
    );

    expect(new URL(target.url).pathname).toBe(
      "/secret/:/https/veil.ortlinde.com/v1/image/42"
    );
  });

  it("rejects a non-HTTPS Resin endpoint", () => {
    expect(() =>
      resolveImageUpstreamTarget(
        "42",
        "http://resin.example.com/secret/Default/https/veil.ortlinde.com"
      )
    ).toThrow("must use HTTPS");
  });
});

describe("fetchImageUpstream", () => {
  it("returns the first successful response without retrying", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200));
    const beforeAttempt = vi.fn(allowed);

    const result = await fetchImageUpstream({
      target: resinTarget(),
      headers: {},
      beforeAttempt,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result.kind).toBe("response");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(beforeAttempt).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it.each([
    [[429, 200], 2],
    [[403, 429, 200], 3],
  ])("rotates limited responses %j", async (statuses, attempts) => {
    const fetchImpl = vi.fn();
    for (const status of statuses) {
      fetchImpl.mockResolvedValueOnce(response(status));
    }

    const result = await fetchImageUpstream({
      target: resinTarget(),
      headers: {},
      beforeAttempt: allowed,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result.kind).toBe("response");
    if (result.kind === "response") expect(result.response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(attempts);
  });

  it("stops after three limited responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(429));

    const result = await fetchImageUpstream({
      target: resinTarget(),
      headers: {},
      beforeAttempt: allowed,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.kind).toBe("response");
    if (result.kind === "response") expect(result.response.status).toBe(429);
  });

  it.each([404, 500])("does not retry status %i", async (status) => {
    const fetchImpl = vi.fn().mockResolvedValue(response(status));

    await fetchImageUpstream({
      target: resinTarget(),
      headers: {},
      beforeAttempt: allowed,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("checks capacity before every real attempt", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(429));
    const beforeAttempt = vi
      .fn()
      .mockResolvedValueOnce({ allowed: true, limit: 300, resetMs: 0 })
      .mockResolvedValueOnce({ allowed: false, limit: 300, resetMs: 5_000 });

    const result = await fetchImageUpstream({
      target: resinTarget(),
      headers: {},
      beforeAttempt,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result).toEqual({
      kind: "local-rate-limit",
      rateLimit: { allowed: false, limit: 300, resetMs: 5_000 },
      attempts: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(beforeAttempt).toHaveBeenCalledTimes(2);
  });

  it("does not retry or expose the proxy URL after a network failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new Error(`failed ${resinTarget().url}`));

    await expect(
      fetchImageUpstream({
        target: resinTarget(),
        headers: {},
        beforeAttempt: allowed,
        fetchImpl: fetchImpl as typeof fetch,
      })
    ).rejects.toMatchObject({
      name: "ImageUpstreamFetchError",
      attempts: 1,
      timedOut: false,
    });

    try {
      await fetchImageUpstream({
        target: resinTarget(),
        headers: {},
        beforeAttempt: allowed,
        fetchImpl: fetchImpl as typeof fetch,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ImageUpstreamFetchError);
      expect(String(error)).not.toContain("secret");
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps direct mode to one attempt", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(429));

    await fetchImageUpstream({
      target: resolveImageUpstreamTarget("42", ""),
      headers: {},
      beforeAttempt: allowed,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
