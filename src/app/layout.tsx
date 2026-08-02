import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const themeInitScript = `
  (() => {
    const root = document.documentElement;
    let theme = "dark";
    try {
      const stored = localStorage.getItem("veil-theme");
      theme = stored === "light" || stored === "dark"
        ? stored
        : (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    } catch {
      theme = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  })();
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Veil Gallery · 现代时尚写真",
    template: "%s · Veil Gallery",
  },
  description:
    "精选现代时尚写真图集，瀑布流浏览，支持标签与分类。优雅、极简、高清体验。",
  openGraph: {
    title: "Veil Gallery",
    description: "现代时尚写真站",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ThemeProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
