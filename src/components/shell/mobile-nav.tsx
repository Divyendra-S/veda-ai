"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Settings, X } from "lucide-react";
import crest from "@/assets/brand/school-crest.png";
import { LogoMark } from "@/components/brand/logo-mark";
import { SparkleMark } from "@/components/brand/sparkle-mark";
import { NAV_ITEMS, type NavItem } from "@/components/shell/nav-items";
import { cn } from "@/lib/cn";

/** The sidebar's row, verbatim, minus the rail variants a drawer has no use
 *  for. Kept in step deliberately: see the note on the component below. */
const ROW =
  "flex h-10 items-center gap-2 rounded-lg px-3 text-[16px] transition-colors";

/**
 * The nav, for the width where the rail is gone.
 *
 * The phone frame has no sidebar at all: the brand moves into the topbar and a
 * hamburger stands in for the rest. 68px of inert icons is a sixth of a 390px
 * screen, and the two panes need it more than the nav does — so the nav becomes
 * something you ask for. What opens is the same set of items the sidebar shows,
 * with the same ones inert, because the point of the drawer is to be the
 * sidebar rather than a second, smaller idea of one.
 *
 * Which is why every metric here is the sidebar's and not a smaller idea of
 * those either — the same 304px width, padding, section rhythm, row height,
 * type sizes and school card. It had drifted a size down across the board while
 * the sidebar was being corrected against the design node; a drawer that is
 * visibly a different component the moment you open it fails at the one job the
 * comment above gives it.
 */
export function MobileNav({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  // Escape closes, and the page behind stops scrolling while it is open. Both
  // are what a panel covering the screen has to do to not feel broken.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 sm:hidden">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 bg-ink/35"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        // `overflow-y-auto` because a short phone is a real phone: at 320x568
        // the sidebar's own rhythm is about 90px taller than the drawer, and
        // clipped is the one way that can fail silently — the school card and
        // Settings would simply not be there. `mt-auto` on the footer still
        // does its job whenever there is room.
        className="scrollbar-slim absolute inset-y-2 left-2 flex w-(--spacing-sidebar) max-w-[calc(100vw-64px)] flex-col overflow-y-auto rounded-shell bg-surface px-6 pt-6 pb-6 shadow-card"
      >
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-10" />
          <span className="text-[28px] leading-5 font-bold tracking-[-0.06em] text-ink">
            VedaAI
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="ml-auto grid size-8 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink"
          >
            <X className="size-5" strokeWidth={2} />
          </button>
        </div>

        <button
          type="button"
          className="mt-14 flex h-[42px] items-center justify-center gap-2.5 rounded-full border-4 border-brand-ring bg-toolkit text-[16px] font-medium text-white shadow-[inset_0_-1px_3.5px_rgba(177,177,177,0.6),inset_0_0_24px_rgba(255,255,255,0.22)]"
        >
          <SparkleMark />
          AI Teacher’s Toolkit
        </button>

        <nav className="mt-14 flex flex-col gap-2">
          {NAV_ITEMS.map((item) => (
            <Row
              key={item.label}
              item={item}
              active={item.href ? pathname.startsWith(item.href) : false}
              onNavigate={onClose}
            />
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-2 pt-8">
          <button
            type="button"
            disabled
            title="Not part of this prototype"
            className={cn(ROW, "text-muted disabled:cursor-default")}
          >
            <Settings className="size-5 shrink-0" strokeWidth={1.8} />
            <span>Settings</span>
          </button>

          <div className="flex items-center gap-2 rounded-2xl bg-subtle p-3">
            <Image
              src={crest}
              alt=""
              className="h-[60px] w-[59px] shrink-0 object-contain"
            />
            <span className="min-w-0">
              <span className="block truncate text-[16px] font-bold text-ink">
                Delhi Public School
              </span>
              <span className="block truncate text-[14px] text-muted">
                Bokaro Steel City
              </span>
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Row({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  const content = (
    <>
      <Icon className="size-5 shrink-0" strokeWidth={1.8} />
      <span>{item.label}</span>
    </>
  );

  if (!item.href) {
    return (
      <button
        type="button"
        disabled
        title="Not part of this prototype"
        className={cn(ROW, "text-muted disabled:cursor-default")}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        ROW,
        active
          ? "bg-subtle font-medium text-ink"
          : "text-muted hover:bg-subtle/70 hover:text-ink",
      )}
    >
      {content}
    </Link>
  );
}
