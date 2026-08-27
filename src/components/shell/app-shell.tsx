import type { ReactNode } from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

/**
 * Everything floats: a 12px inset around a sidebar and a main column, both
 * rounded cards sitting on the page gradient. `h-dvh` with `min-h-0` on the
 * children keeps scrolling inside the panels rather than on the page, which is
 * what the review screen needs — the question list and the answer sheet scroll
 * independently.
 */
export function AppShell({
  children,
  section,
}: {
  children: ReactNode;
  section?: string;
}) {
  return (
    <div className="flex h-dvh gap-3 p-3 sm:gap-4 sm:p-(--spacing-shell)">
      {/* No sidebar on a phone: the design's phone frame drops it entirely and
          moves the brand into the topbar, where a hamburger opens the nav. The
          rail would otherwise spend a sixth of a 390px screen on items that do
          nothing. */}
      <Sidebar className="hidden sm:flex" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Topbar section={section} />
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
