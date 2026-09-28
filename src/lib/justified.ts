/** Portrait fallback when upstream has no dimensions (matches old 3/4 tiles). */
export const FALLBACK_ASPECT_RATIO = 3 / 4;
/** Clamp extremes so a panorama can't flatten a row, nor a strip tower it. */
export const MIN_ASPECT_RATIO = 0.4;
export const MAX_ASPECT_RATIO = 3;

/** width / height, clamped for row packing. */
export function aspectRatio(
  width: number | null | undefined,
  height: number | null | undefined
): number {
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !(width > 0) ||
    !(height > 0)
  ) {
    return FALLBACK_ASPECT_RATIO;
  }
  return Math.min(MAX_ASPECT_RATIO, Math.max(MIN_ASPECT_RATIO, width / height));
}
