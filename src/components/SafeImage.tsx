"use client";
import { useState } from "react";
import { imageUrl } from "@/lib/api";

export default function SafeImage({
  id,
  alt,
  className = "",
}: {
  id: number;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`flex min-h-[120px] items-center justify-center bg-zinc-900 text-xs text-white/30 ${className}`}>
        图片加载失败
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl(id)}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
