"use client";

import Link from "next/link";
import { useTheme } from "./ThemeProvider";

export default function Header() {
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="group flex items-center gap-2 font-serif text-xl tracking-widest text-white"
        >
          <span className="text-[#c9a87c] transition group-hover:text-[#e0c9a0]">
            VEIL
          </span>
          <span className="hidden text-xs font-sans font-light tracking-normal text-white/50 sm:inline">
            GALLERY
          </span>
        </Link>

        <nav className="flex items-center gap-5 text-sm font-medium text-white/70 sm:gap-6">
          <Link href="/" className="transition hover:text-[#c9a87c]">
            首页
          </Link>
          <Link href="/galleries" className="transition hover:text-[#c9a87c]">
            图集
          </Link>
          <Link href="/tags" className="transition hover:text-[#c9a87c]">
            标签
          </Link>

          <button
            type="button"
            onClick={toggle}
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:border-[#c9a87c]/50 hover:text-[#c9a87c]"
            aria-label={theme === "dark" ? "切换亮色模式" : "切换暗色模式"}
            title={theme === "dark" ? "亮色模式" : "暗色模式"}
          >
            {theme === "dark" ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </nav>
      </div>
    </header>
  );
}
