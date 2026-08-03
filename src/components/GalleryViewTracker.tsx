"use client";

import { useEffect } from "react";

interface Props {
  id: number;
  title: string;
  coverId: number;
  category: string | null;
  imageCount: number;
}

function storageKey(id: number): string {
  return `vg:pv:${id}`;
}

/**
 * Client beacon for gallery detail PV. ISR-safe (page HTML may be cached).
 * sessionStorage: once per tab session per id (StrictMode + soft navigations).
 * Server still enforces 1/300s per IP+id.
 */
export default function GalleryViewTracker({
  id,
  title,
  coverId,
  category,
  imageCount,
}: Props) {
  useEffect(() => {
    if (!id || id <= 0) return;

    try {
      if (sessionStorage.getItem(storageKey(id))) return;
      sessionStorage.setItem(storageKey(id), "1");
    } catch {
      // Private mode / blocked storage — still attempt one POST; server dedupes.
    }

    const body = JSON.stringify({
      id,
      title,
      coverId,
      category,
      imageCount,
    });

    fetch("/api/view/gallery", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => {});
  }, [id, title, coverId, category, imageCount]);

  return null;
}
