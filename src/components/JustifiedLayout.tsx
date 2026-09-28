import type { ReactNode } from "react";

export interface JustifiedItem<T> {
  key: string | number;
  data: T;
  /** width / height of the tile */
  ratio: number;
  render: (data: T) => ReactNode;
}

interface Props<T> {
  items: JustifiedItem<T>[];
  className?: string;
}

/**
 * Justified rows (Flickr/Google Photos style), pure CSS so SSR matches the client.
 * Each tile is `flex: r 1 r*rowHeight` + `aspect-ratio: r`: the free space in a
 * row is split in proportion to r, so every tile in a row keeps the same height
 * and the row fills the width. DOM order is reading order: 1 → 2 → 3 → 4.
 */
export default function JustifiedLayout<T>({ items, className = "" }: Props<T>) {
  return (
    <div
      className={`flex flex-wrap gap-3 [--row-h:180px] sm:[--row-h:240px] lg:[--row-h:300px] ${className}`}
    >
      {items.map((item) => (
        <div
          key={item.key}
          className="min-w-0"
          style={{
            flex: `${item.ratio} 1 calc(var(--row-h) * ${item.ratio})`,
            aspectRatio: String(item.ratio),
          }}
        >
          {item.render(item.data)}
        </div>
      ))}
      {/* Soaks up the last row's free space so it keeps ~row-h instead of stretching. */}
      <div aria-hidden className="h-0" style={{ flex: "10000 1 0" }} />
    </div>
  );
}
