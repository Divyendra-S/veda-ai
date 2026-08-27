import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { SIDEBAR_INIT_SCRIPT } from "@/components/shell/use-sidebar";

/**
 * General Sans (Fontshare, ITF Free Font License) is the typeface in the Figma
 * design — identifiable by the double-story `a`, single-story `g`, angled `t`
 * terminal and the `Q` whose tail swings out to the lower left.
 *
 * Self-hosted rather than CDN-linked: next/font inlines the @font-face and
 * preloads the file, so there is no render-blocking round trip to a third party
 * and no layout shift. One variable file covers 200-700 in 38KB.
 */
const generalSans = localFont({
  src: "./fonts/GeneralSans-Variable.woff2",
  variable: "--font-general-sans",
  weight: "200 700",
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
      className={`${generalSans.variable} h-full`}
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
