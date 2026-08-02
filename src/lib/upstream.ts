/** Upstream origin for JSON + image fetches. */
export const UPSTREAM_BASE = "https://veil.ortlinde.com";

/** Shared outbound identity for polite upstream requests. */
export const USER_AGENT =
  "VeilGallery/1.0 (+https://veil-gallery.vercel.app)";

export function upstreamUrl(path: string): string {
  return `${UPSTREAM_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export function upstreamImageUrl(id: number | string): string {
  return upstreamUrl(`/v1/image/${id}`);
}
