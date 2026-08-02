import Link from "next/link";

interface Props {
  name: string;
  count?: number;
  href?: string;
}

export default function TagPill({ name, count, href }: Props) {
  const target = href || `/tag/${encodeURIComponent(name)}`;
  return (
    <Link
      href={target}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/80 transition hover:border-accent/60 hover:bg-accent/10 hover:text-accent"
    >
      <span>{name}</span>
      {typeof count === "number" && (
        <span className="text-xs text-white/40">{count}</span>
      )}
    </Link>
  );
}
