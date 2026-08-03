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
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted transition hover:border-accent/60 hover:bg-accent/10 hover:text-accent"
    >
      <span>{name}</span>
      {typeof count === "number" && (
        <span className="text-xs text-subtle">{count}</span>
      )}
    </Link>
  );
}
