import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import "generative-charts/styles.css";
import "@/stunning-md/stunning.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Build-time, optional: a name and an icon make the site installable to a phone's
 * home screen (`NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_ICON` — a square PNG, 512 px).
 */
const appName = process.env.NEXT_PUBLIC_APP_NAME;
const appIcon = process.env.NEXT_PUBLIC_APP_ICON;

export const metadata: Metadata = {
  title: appName ?? "stunning-md — Markdown in. A beautifully designed website out.",
  description:
    "Open any markdown file and see it rendered as a responsive, themed, navigable page.",
  ...(appName
    ? // The page runs under the status bar, which so takes the page's colour; the component keeps its bar clear of it.
      {
        appleWebApp: { capable: true, title: appName, statusBarStyle: "black-translucent" as const },
        // Next writes the unprefixed name; older iOS only knows this one.
        other: { "apple-mobile-web-app-capable": "yes" },
      }
    : {}),
  ...(appIcon ? { icons: { icon: appIcon, apple: appIcon } } : {}),
};

/** `cover` lets the page reach the screen's edges; the safe-area insets keep its controls clear of them. */
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
