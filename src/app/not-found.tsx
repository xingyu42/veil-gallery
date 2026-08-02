import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-32 text-center">
      <h1 className="font-serif text-6xl text-[#c9a87c]">404</h1>
      <p className="mt-4 text-white/50">页面或图集不存在</p>
      <Link
        href="/"
        className="mt-8 rounded-full border border-[#c9a87c]/40 px-6 py-2.5 text-sm text-[#c9a87c] transition hover:bg-[#c9a87c]/10"
      >
        返回首页
      </Link>
    </div>
  );
}
