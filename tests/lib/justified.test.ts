import { describe, expect, it } from "vitest";
import {
  FALLBACK_ASPECT_RATIO,
  MAX_ASPECT_RATIO,
  MIN_ASPECT_RATIO,
  aspectRatio,
} from "@/lib/justified";

describe("aspectRatio", () => {
  it("returns width / height for valid dimensions", () => {
    expect(aspectRatio(1200, 1600)).toBe(0.75);
    expect(aspectRatio(1920, 1080)).toBeCloseTo(16 / 9);
  });

  it("falls back to portrait when dimensions are missing or invalid", () => {
    expect(aspectRatio(null, null)).toBe(FALLBACK_ASPECT_RATIO);
    expect(aspectRatio(undefined, 800)).toBe(FALLBACK_ASPECT_RATIO);
    expect(aspectRatio(0, 800)).toBe(FALLBACK_ASPECT_RATIO);
    expect(aspectRatio(800, Number.NaN)).toBe(FALLBACK_ASPECT_RATIO);
  });

  it("clamps panoramas and tall strips", () => {
    expect(aspectRatio(6000, 1000)).toBe(MAX_ASPECT_RATIO);
    expect(aspectRatio(500, 5000)).toBe(MIN_ASPECT_RATIO);
  });
});
