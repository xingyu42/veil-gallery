import { NextRequest, NextResponse } from "next/server";
import {
  getPopularGalleries,
  POPULAR_WINDOWS,
  type PopularWindow,
} from "@/lib/gallery-views";

export const runtime = "nodejs";

/**
 * Paginated popular boards (?window=day|week|month|all&limit=&offset=).
 * Backs the /popular infinite scroll; also usable by other clients.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const rawWindow = sp.get("window") ?? "all";
  const window = (
    POPULAR_WINDOWS.includes(rawWindow as PopularWindow)
      ? rawWindow
      : "all"
  ) as PopularWindow;

  const limit = Math.min(
    24,
    Math.max(1, parseInt(sp.get("limit") || "12", 10) || 12)
  );
  const offset = Math.max(0, parseInt(sp.get("offset") || "0", 10) || 0);

  const page = await getPopularGalleries({ window, limit, offset });
  return NextResponse.json(page, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
