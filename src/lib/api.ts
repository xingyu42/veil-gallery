import type {
  Paginated,
  TagItem,
  CategoryItem,
  GalleryListItem,
  GalleryDetail,
  GalleryImage,
  GalleryImagePage,
  SiteConfig,
  FeaturedTag,
  ImageMeta,
} from "./types";
import { USER_AGENT, upstreamUrl } from "./upstream";
import { getUpstreamError } from "./upstream-error";

async function apiFetch<T>(
  path: string,
  revalidateSeconds = 900,
  opts?: { timeoutMs?: number }
): Promise<T> {
  const res = await fetch(upstreamUrl(path), {
    next: { revalidate: revalidateSeconds },
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    ...(opts?.timeoutMs
      ? { signal: AbortSignal.timeout(opts.timeoutMs) }
      : {}),
  });
  if (!res.ok) {
    const upstreamError = getUpstreamError(res.status);
    if (upstreamError) throw upstreamError;
    throw new Error(`API ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

export async function getSiteConfig(): Promise<SiteConfig> {
  return apiFetch("/v1/site-config", 3600);
}

export async function getFeaturedTags(): Promise<{ items: FeaturedTag[] }> {
  return apiFetch("/v1/featured-tags", 3600);
}

export async function getCategories(): Promise<{
  items: CategoryItem[];
  total: number;
}> {
  return apiFetch("/v1/categories", 3600);
}

export async function getTags(
  limit = 48,
  offset = 0
): Promise<Paginated<TagItem>> {
  return apiFetch(`/v1/tags?limit=${limit}&offset=${offset}`, 1800);
}

export async function getAllTags(): Promise<Paginated<TagItem>> {
  // The 20,000-item payload exceeds Next's 2 MB data-cache limit.
  // The API route caches the complete response at the CDN layer instead.
  return apiFetch("/v1/tags?limit=20000&offset=0", 0);
}

function isDisplayableGallery(gallery: GalleryListItem): boolean {
  return (
    (gallery.uploaded_images ?? 0) > 0 && Boolean(gallery.cover?.image_id)
  );
}

/**
 * Fetch galleries with uploaded covers.
 * Upstream pages can be sparse after filter, so scan multiple batches until
 * `limit` is filled, the list is exhausted, or maxScans is hit.
 * Empty (non-displayable) streaks jump geometrically to escape sparse heads.
 */
export async function getGalleries(
  limit = 24,
  offset = 0,
  category?: string
): Promise<Paginated<GalleryListItem> & { next_offset: number }> {
  const batchSize = Math.min(48, Math.max(limit * 2, limit));
  const maxScans = 12;
  const FETCH_TIMEOUT_MS = 8_000;
  const collected: GalleryListItem[] = [];
  const seen = new Set<number>();
  let cursor = Math.max(0, offset);
  let total = 0;
  let scans = 0;
  let exhausted = false;
  let emptyStreak = 0;
  let lastData: Paginated<GalleryListItem> | null = null;

  while (collected.length < limit && scans < maxScans && !exhausted) {
    const params = new URLSearchParams({
      limit: String(batchSize),
      offset: String(cursor),
    });
    if (category) params.set("category", category);

    const data = await apiFetch<Paginated<GalleryListItem>>(
      `/v1/galleries?${params}`,
      300,
      { timeoutMs: FETCH_TIMEOUT_MS }
    );
    lastData = data;
    total = data.total;
    scans += 1;

    const raw = data.items || [];
    if (raw.length === 0) {
      exhausted = true;
      break;
    }

    const beforeCount = collected.length;
    for (const gallery of raw) {
      if (seen.has(gallery.id)) continue;
      seen.add(gallery.id);
      if (!isDisplayableGallery(gallery)) continue;
      collected.push(gallery);
      if (collected.length >= limit) break;
    }

    const added = collected.length - beforeCount;
    if (added === 0) {
      emptyStreak += 1;
      const jumpMul = Math.min(2 ** (emptyStreak - 1), 16);
      cursor += batchSize * jumpMul;
    } else {
      emptyStreak = 0;
      cursor += batchSize;
    }

    if (raw.length < batchSize || cursor >= total) {
      exhausted = true;
    }
  }

  const nextOffset = cursor;
  const hasNext = !exhausted && nextOffset < total;

  return {
    items: collected,
    total: lastData?.total ?? total,
    limit,
    offset,
    page: lastData?.page,
    total_pages: lastData?.total_pages,
    has_prev: offset > 0,
    has_next: hasNext,
    next_offset: nextOffset,
  };
}

function isGalleryImage(value: unknown): value is GalleryImage {
  if (!value || typeof value !== "object") return false;
  return typeof (value as { id?: unknown }).id === "number";
}

function normalizeImages(payload: unknown): GalleryImage[] {
  if (Array.isArray(payload)) {
    return payload.filter(isGalleryImage);
  }
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  const candidates = [
    record.images,
    record.items,
    (record.data as Record<string, unknown> | undefined)?.images,
    (record.data as Record<string, unknown> | undefined)?.items,
    (record.gallery as Record<string, unknown> | undefined)?.images,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter(isGalleryImage);
  }
  return [];
}

function getImageTotal(payload: unknown, fallback: number): number {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;
  const values = [
    record.uploaded_images,
    record.image_count,
    record.total,
    (record.pagination as Record<string, unknown> | undefined)?.total,
    (record.gallery as Record<string, unknown> | undefined)?.uploaded_images,
    (record.gallery as Record<string, unknown> | undefined)?.image_count,
  ];
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return fallback;
}

export function availableImages(images: GalleryImage[]): GalleryImage[] {
  return images
    .filter((image) => {
      const statusOk = image.status === "active" || !image.status;
      const uploaded = image.uploaded === true || image.uploaded === undefined;
      return statusOk && uploaded;
    })
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

export async function getGallery(id: number | string): Promise<GalleryDetail> {
  const gallery = await apiFetch<GalleryDetail>(`/v1/gallery/${id}`, 3600);
  gallery.images = availableImages(Array.isArray(gallery.images) ? gallery.images : []);
  return gallery;
}

export async function getGalleryImages(
  id: number | string,
  offset = 0,
  limit = 20,
  expectedTotal = 0,
  afterSortOrder = offset
): Promise<GalleryImagePage> {
  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.min(40, Math.max(1, limit));
  const safeAfterSortOrder = Math.max(0, afterSortOrder);
  // The upstream OpenAPI exposes image_limit/image_offset; limit/offset is ignored.
  const payload = await apiFetch<unknown>(
    `/v1/gallery/${id}?image_limit=${safeLimit}&image_offset=${safeOffset}`,
    300
  );
  const allImages = availableImages(normalizeImages(payload));
  const total = getImageTotal(
    payload,
    Math.max(expectedTotal, safeOffset, allImages.length)
  );
  const items = allImages
    .filter(
      (image) =>
        !(typeof image.sort_order === "number" && image.sort_order > 0) ||
        image.sort_order > safeAfterSortOrder
    )
    .slice(0, safeLimit);

  if (items.length === 0 && safeOffset < total) {
    throw new Error("源站没有返回新的图片");
  }

  const nextOffset = safeOffset + items.length;
  return {
    items,
    total,
    offset: safeOffset,
    limit: safeLimit,
    next_offset: nextOffset,
    has_more: nextOffset < total,
  };
}

export async function getImageMeta(
  id: number | string
): Promise<ImageMeta> {
  return apiFetch(`/v1/image/${id}/meta`, 86400);
}

export async function getTagPreview(
  name: string
): Promise<{ image_ids: number[] }> {
  return apiFetch(`/v1/tag/${encodeURIComponent(name)}/preview`, 3600);
}

export function imageUrl(id: number | string): string {
  return `/api/image/${id}`;
}
