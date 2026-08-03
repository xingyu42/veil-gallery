import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-32 text-center">
      <h1 className="font-serif text-6xl text-accent">404</h1>
      <p className="mt-4 text-muted">页面或图集不存在</p>
      <Link
        href="/"
        className="mt-8 rounded-full border border-accent/40 px-6 py-2.5 text-sm text-accent transition hover:bg-accent/10"
      >
        返回首页
      </Link>
    </div>
  );
}
