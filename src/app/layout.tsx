import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SIDEBAR_INIT_SCRIPT } from "@/components/shell/use-sidebar";

/**
 * Bricolage Grotesque is the typeface the design is actually set in. The Figma
 * file names it outright in its own tokens — every Paragraph style is
 * `Bricolage Grotesque` at 1.4 line-height and -4% tracking — and it is what
 * the flared stems and squared-off bowls in the exports are. The earlier guess
 * was read off the pixels and was wrong.
 *
 * `next/font/google` self-hosts: the file is fetched once at build time, served
 * from our own origin and preloaded, so nothing about it costs a render-
 * blocking round trip to Google or a layout shift at runtime.
 *
 * No `axes`. The design pins `opsz 14, wdth 100`, and those are this font's own
 * default axis values, so the weight-only variable file already renders exactly
 * what Figma draws — while staying the smaller download.
 */
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Veda AI — Assessment Extraction",
  description:
    "Upload a question paper and a student answer sheet to extract questions, map answers and grade them.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        {/* Runs synchronously during parse so the sidebar never paints in the
            wrong width. It only sets an attribute the CSS reads. */}
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
