import { getRedis } from "./redis";
import type { GalleryListItem } from "./types";

const PV_ZSET = "gallery:pv";

export interface GalleryViewInput {
  id: number;
  title: string;
  coverId: number;
  category: string | null;
  imageCount: number;
}

function infoKey(id: number | string): string {
  return `gallery:info:${id}`;
}

/**
 * Record one gallery detail view into Redis (ZSET score + card snapshot HASH).
 * Fail-open: missing Redis or errors are logged and swallowed.
 */
export async function recordGalleryView(input: GalleryViewInput): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const id = input.id;
  const member = String(id);
  const title = input.title.slice(0, 200);
  const category = (input.category ?? "").slice(0, 100);
  const imageCount = Math.max(0, Math.floor(input.imageCount) || 0);
  const coverId = Math.max(0, Math.floor(input.coverId) || 0);
  const updatedAt = new Date().toISOString();

  const fields: Record<string, string> = {
    title,
    category,
    image_count: String(imageCount),
    updated_at: updatedAt,
  };
  // Never overwrite a good cover with 0 from a bad snapshot.
  if (coverId > 0) {
    fields.cover_id = String(coverId);
  }

  try {
    const p = redis.pipeline();
    p.zincrby(PV_ZSET, 1, member);
    p.hset(infoKey(id), fields);
    await p.exec();
  } catch (error) {
    console.error("[gallery-views] record failed:", error);
  }
}

type InfoHash = {
  title?: string;
  cover_id?: string;
  category?: string;
  image_count?: string;
  updated_at?: string;
};

function mapInfoToListItem(id: number, hash: InfoHash | null): GalleryListItem | null {
  if (!hash) return null;

  const title = (hash.title ?? "").trim();
  const coverId = Math.max(0, parseInt(hash.cover_id || "0", 10) || 0);
  // Skip incomplete snapshots (no title and no cover).
  if (!title && coverId <= 0) return null;

  return {
    id,
    title: title || `Gallery #${id}`,
    series_number: null,
    category: hash.category?.trim() ? hash.category.trim() : null,
    image_count: Math.max(0, parseInt(hash.image_count || "0", 10) || 0),
    status: "active",
    updated_at: hash.updated_at || new Date(0).toISOString(),
    cover:
      coverId > 0
        ? {
            image_id: coverId,
            width: null,
            height: null,
            orientation: null,
          }
        : null,
  };
}

/**
 * Top galleries by PV. Pure Redis — no upstream fetch.
 * Fail-open → [].
 */
export async function getPopularGalleries(limit = 8): Promise<GalleryListItem[]> {
  const redis = getRedis();
  if (!redis) return [];

  const n = Math.min(24, Math.max(1, Math.floor(limit) || 8));

  try {
    // Highest scores first; fetch a few extra so we can skip incomplete hashes.
    const fetchN = Math.min(48, n + 8);
    const members = await redis.zrange<string[]>(PV_ZSET, 0, fetchN - 1, {
      rev: true,
    });

    if (!members?.length) return [];

    const ids = members
      .map((m) => parseInt(String(m), 10))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (!ids.length) return [];

    const p = redis.pipeline();
    for (const id of ids) {
      p.hgetall<InfoHash>(infoKey(id));
    }
    const hashes = await p.exec<Array<InfoHash | null>>();

    const items: GalleryListItem[] = [];
    for (let i = 0; i < ids.length && items.length < n; i++) {
      const item = mapInfoToListItem(ids[i], hashes[i] ?? null);
      if (item) items.push(item);
    }
    return items;
  } catch (error) {
    console.error("[gallery-views] getPopular failed:", error);
    return [];
  }
}
