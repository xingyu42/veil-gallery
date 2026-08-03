"use client";

import { useMemo } from "react";
import GalleryCard from "./GalleryCard";
import ShortestColumnMasonry, {
  relativeHeight,
  type MasonryItem,
} from "./ShortestColumnMasonry";
import type { GalleryListItem } from "@/lib/types";

export default function HomeGalleryPreview({
  galleries,
}: {
  galleries: GalleryListItem[];
}) {
  const items = useMemo<MasonryItem<GalleryListItem>[]>(
    () =>
      galleries.map((g) => ({
        key: g.id,
        data: g,
        weight: relativeHeight(g.cover?.width, g.cover?.height),
        render: (gallery) => <GalleryCard gallery={gallery} />,
      })),
    [galleries]
  );

  return <ShortestColumnMasonry items={items} gapClassName="gap-4" />;
}
