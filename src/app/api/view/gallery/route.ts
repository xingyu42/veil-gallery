import { NextRequest, NextResponse } from "next/server";
import { recordGalleryView } from "@/lib/gallery-views";
import { checkGalleryViewRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

function asString(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.slice(0, max);
}

function asNonNegInt(v: unknown): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * Fire-and-forget gallery detail view beacon.
 * Always 204 on valid shape (including rate-limit skip / Redis fail-open).
 * 400 only for malformed body / invalid id.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 400, headers: NO_STORE });
  }

  if (!body || typeof body !== "object") {
    return new NextResponse(null, { status: 400, headers: NO_STORE });
  }

  const raw = body as Record<string, unknown>;
  const id = asNonNegInt(raw.id);
  if (!id || id <= 0) {
    return new NextResponse(null, { status: 400, headers: NO_STORE });
  }

  const title = asString(raw.title, 200);
  const category = asString(raw.category, 100) || null;
  const coverId = asNonNegInt(raw.coverId ?? raw.cover_id);
  const imageCount = asNonNegInt(raw.imageCount ?? raw.image_count);

  const ip = clientIp(req);
  const limit = await checkGalleryViewRateLimit(ip, id);
  if (!limit.allowed) {
    console.info(`[gallery-views] skip:rate ip=${ip} id=${id}`);
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  }

  await recordGalleryView({
    id,
    title,
    coverId,
    category,
    imageCount,
  });

  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
