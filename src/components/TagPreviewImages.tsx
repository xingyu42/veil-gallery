"use client";

import { useMemo, useState } from "react";
import RemoteImage from "./RemoteImage";
import Masonry from "./Masonry";
import Lightbox from "./Lightbox";
import type { GalleryImage } from "@/lib/types";

interface Props {
  imageIds: number[];
  tagName: string;
}

export default function TagPreviewImages({ imageIds, tagName }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const images = useMemo<GalleryImage[]>(
    () =>
      imageIds.map((id, index) => ({
        id,
        sort_order: index + 1,
        width: null,
        height: null,
        orientation: null,
        status: "active",
        uploaded: true,
      })),
    [imageIds]
  );

  return (
    <>
      <Masonry>
        {images.map((image, index) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setActiveIndex(index)}
            className="group relative mb-4 block w-full break-inside-avoid cursor-zoom-in overflow-hidden rounded-lg bg-zinc-900 ring-1 ring-white/10 transition hover:ring-[#c9a87c]/40"
          >
            <RemoteImage
              id={image.id}
              alt={`${tagName} #${index + 1}`}
              className="w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            />
          </button>
        ))}
      </Masonry>

      <Lightbox
        images={images}
        index={activeIndex}
        total={images.length}
        title={`#${tagName}`}
        onClose={() => setActiveIndex(null)}
        onPrevious={() =>
          setActiveIndex((current) =>
            current === null ? null : Math.max(0, current - 1)
          )
        }
        onNext={() =>
          setActiveIndex((current) =>
            current === null ? null : Math.min(images.length - 1, current + 1)
          )
        }
      />
    </>
  );
}
