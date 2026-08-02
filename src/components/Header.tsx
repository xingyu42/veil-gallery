"use client";

import Link from "next/link";
import { useTheme } from "./ThemeProvider";

export default function Header() {
  const { toggle } = useTheme();

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="group flex items-center gap-2 font-serif text-xl tracking-widest text-white"
        >
          <span className="text-accent transition group-hover:text-accent">
            VEIL
          </span>
          <span className="hidden text-xs font-sans font-light tracking-normal text-white/50 sm:inline">
            GALLERY
          </span>
        </Link>

        <nav className="flex items-center gap-5 text-sm font-medium text-white/70 sm:gap-6">
          <Link href="/" className="transition hover:text-accent">
            首页
          </Link>
          <Link href="/galleries" className="transition hover:text-accent">
            图集
          </Link>
          <Link href="/tags" className="transition hover:text-accent">
            标签
          </Link>

          <button
            type="button"
            onClick={toggle}
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:border-accent/50 hover:text-accent"
            aria-label="切换主题"
            title="切换主题"
          >
            <svg className="theme-icon-dark" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
            <svg className="theme-icon-light" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>
        </nav>
      </div>
    </header>
  );
}
