import { getRedis } from "./redis";
import type { GalleryListItem } from "./types";

const PV_ZSET = "gallery:pv";
const INFO_HASH = "gallery:info";
const MERGE_INFO_SCRIPT = `
local incoming = cjson.decode(ARGV[2])
local current_raw = redis.call("HGET", KEYS[1], ARGV[1])
if current_raw then
  local decoded, current = pcall(cjson.decode, current_raw)
  if decoded and incoming.cover_id == nil and current.cover_id ~= nil then
    incoming.cover_id = current.cover_id
  end
end
redis.call("HSET", KEYS[1], ARGV[1], cjson.encode(incoming))
return 1
`;

/** Popular boards: all-time cumulative + calendar windows. */
export type PopularWindow = "day" | "week" | "month" | "all";

/** Valid window values — single source of truth for route/page validation. */
export const POPULAR_WINDOWS: readonly PopularWindow[] = [
  "day",
  "week",
  "month",
  "all",
];

/** GC horizon for window keys; only the current window is ever read. */
const WINDOW_TTL_S: Record<Exclude<PopularWindow, "all">, number> = {
  day: 2 * 86_400,
  week: 14 * 86_400,
  month: 62 * 86_400,
};

/** Rankings deeper than this are not served (bounds per-page Redis fan-out). */
const MAX_BOARD_DEPTH = 500;

/** UTC+8 wall clock — day/week/month boundaries follow the CN audience. */
const TZ_SHIFT_MS = 8 * 3_600_000;

/** ISO-8601 week label, e.g. "2026-W32". Input must already be TZ-shifted. */
function isoWeekKey(d: Date): string {
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
  const dow = (date.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  date.setUTCDate(date.getUTCDate() - dow + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const fdow = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fdow + 3);
  const week =
    1 + Math.round((date.getTime() - firstThursday.getTime()) / 604_800_000);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function windowKey(window: PopularWindow, now = new Date()): string {
  if (window === "all") return PV_ZSET;
  const d = new Date(now.getTime() + TZ_SHIFT_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  if (window === "day") return `gallery:pv:day:${y}-${m}-${day}`;
  if (window === "month") return `gallery:pv:month:${y}-${m}`;
  return `gallery:pv:week:${isoWeekKey(d)}`;
}

export interface GalleryViewInput {
  id: number;
  title: string;
  coverId: number;
  category: string | null;
  imageCount: number;
}

/**
 * Record one gallery detail view into Redis: all-time ZSET + day/week/month
 * window ZSETs (TTL'd), plus the card snapshot HASH.
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

  const snapshot: InfoHash = {
    title,
    category,
    image_count: imageCount,
    updated_at: updatedAt,
  };
  // Never overwrite a good cover with 0 from a bad snapshot.
  if (coverId > 0) {
    snapshot.cover_id = coverId;
  }

  try {
    const now = new Date();
    const p = redis.pipeline();
    p.zincrby(PV_ZSET, 1, member);
    for (const w of ["day", "week", "month"] as const) {
      const key = windowKey(w, now);
      p.zincrby(key, 1, member);
      p.expire(key, WINDOW_TTL_S[w]);
    }
    p.eval(MERGE_INFO_SCRIPT, [INFO_HASH], [member, JSON.stringify(snapshot)]);
    await p.exec();
  } catch (error) {
    console.error("[gallery-views] record failed:", error);
  }
}

type InfoHash = {
  title?: string;
  cover_id?: string | number;
  category?: string;
  image_count?: string | number;
  updated_at?: string;
};

function parseInfoHash(value: unknown): InfoHash | null {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as InfoHash;
}

function mapInfoToListItem(id: number, hash: InfoHash | null): GalleryListItem | null {
  if (!hash) return null;

  const title = (hash.title ?? "").trim();
  const coverId = Math.max(0, parseInt(String(hash.cover_id || "0"), 10) || 0);
  // Skip incomplete snapshots (no title and no cover).
  if (!title && coverId <= 0) return null;

  return {
    id,
    title: title || `Gallery #${id}`,
    series_number: null,
    category: hash.category?.trim() ? hash.category.trim() : null,
    image_count: Math.max(
      0,
      parseInt(String(hash.image_count || "0"), 10) || 0
    ),
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

export interface PopularPage {
  items: GalleryListItem[];
  /** Board size actually served (ZSET cardinality capped at MAX_BOARD_DEPTH). */
  total: number;
  /** Raw consumed cursor — advances past skipped incomplete snapshots. */
  next_offset: number;
  has_next: boolean;
}

/**
 * Top galleries by PV within a time window. Pure Redis — no upstream fetch.
 * Fail-open → empty page.
 */
export async function getPopularGalleries(opts?: {
  window?: PopularWindow;
  limit?: number;
  offset?: number;
}): Promise<PopularPage> {
  const redis = getRedis();
  const offset = Math.max(0, Math.floor(opts?.offset ?? 0) || 0);
  const n = Math.min(24, Math.max(1, Math.floor(opts?.limit ?? 12) || 12));
  const emptyPage = (total = 0): PopularPage => ({
    items: [],
    total,
    next_offset: offset,
    has_next: false,
  });
  if (!redis) return emptyPage();

  try {
    const key = windowKey(opts?.window ?? "all");
    // Same round trip: board size + the slice we might need (covers n+8 slack).
    const board = redis.pipeline();
    board.zcard(key);
    board.zrange<string[]>(key, offset, offset + n + 8 - 1, { rev: true });
    const [card, ranked] = await board.exec<[number, string[]]>();
    const total = Math.min(typeof card === "number" ? card : 0, MAX_BOARD_DEPTH);
    if (offset >= total) return emptyPage(total);

    const members = (ranked ?? []).slice(0, total - offset);
    if (!members.length) return emptyPage(total);

    const ids = members
      .map((m) => parseInt(String(m), 10))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (!ids.length) return emptyPage(total);

    const snapshots = await redis.hmget<
      Record<string, InfoHash | string | null>
    >(INFO_HASH, ...ids.map(String));

    const items: GalleryListItem[] = [];
    let scanned = 0;
    for (let i = 0; i < ids.length && items.length < n; i++) {
      scanned = i + 1;
      const item = mapInfoToListItem(
        ids[i],
        parseInfoHash(snapshots?.[String(ids[i])])
      );
      if (item) items.push(item);
    }

    const nextOffset = offset + scanned;
    return {
      items,
      total,
      next_offset: nextOffset,
      has_next: nextOffset < total,
    };
  } catch (error) {
    console.error("[gallery-views] getPopular failed:", error);
    return emptyPage();
  }
}
