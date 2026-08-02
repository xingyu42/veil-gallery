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
import { getUpstreamError } from "./upstream-error";

const API_BASE = "https://veil.ortlinde.com";

async function apiFetch<T>(path: string, revalidateSeconds = 900): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    next: { revalidate: revalidateSeconds },
    headers: {
      Accept: "application/json",
      "User-Agent": "VeilGallery/1.0 (+https://veil-gallery.vercel.app)",
    },
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

export async function getGalleries(
  limit = 24,
  offset = 0,
  category?: string
): Promise<Paginated<GalleryListItem> & { next_offset: number }> {
  const fetchLimit = Math.min(48, Math.max(limit * 2, limit));
  const params = new URLSearchParams({
    limit: String(fetchLimit),
    offset: String(offset),
  });
  if (category) params.set("category", category);

  const data = await apiFetch<Paginated<GalleryListItem>>(
    `/v1/galleries?${params}`,
    300
  );
  const items = (data.items || [])
    .filter((gallery) => {
      return (
        (gallery.uploaded_images ?? 0) > 0 && Boolean(gallery.cover?.image_id)
      );
    })
    .slice(0, limit);
  const nextOffset = offset + fetchLimit;

  return {
    ...data,
    items,
    limit,
    offset,
    has_next: nextOffset < data.total,
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

function availableImages(images: GalleryImage[]): GalleryImage[] {
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
    .filter((image) => {
      if (typeof image.sort_order === "number" && image.sort_order > 0) {
        return image.sort_order > safeAfterSortOrder;
      }
      return true;
    })
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
