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

const ROW = "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px]";

/**
 * The nav, for the width where the rail is gone.
 *
 * The phone frame has no sidebar at all: the brand moves into the topbar and a
 * hamburger stands in for the rest. 68px of inert icons is a sixth of a 390px
 * screen, and the two panes need it more than the nav does — so the nav becomes
 * something you ask for. What opens is the same set of items the sidebar shows,
 * with the same ones inert, because the point of the drawer is to be the
 * sidebar rather than a second, smaller idea of one.
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
        className="absolute inset-y-2 left-2 flex w-[272px] flex-col rounded-shell bg-surface px-5 pt-5 pb-5 shadow-card"
      >
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-10" />
          <span className="text-[21px] font-bold tracking-[-0.02em] text-ink">
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
          className="mt-7 flex h-[42px] items-center justify-center gap-2.5 rounded-full border-4 border-brand-ring bg-toolkit text-[16px] font-medium text-white shadow-[inset_0_-1px_3.5px_rgba(177,177,177,0.6),inset_0_0_24px_rgba(255,255,255,0.22)]"
        >
          <SparkleMark />
          AI Teacher’s Toolkit
        </button>

        <nav className="mt-7 flex flex-col gap-1.5">
          {NAV_ITEMS.map((item) => (
            <Row
              key={item.label}
              item={item}
              active={item.href ? pathname.startsWith(item.href) : false}
              onNavigate={onClose}
            />
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-3 pt-8">
          <button
            type="button"
            disabled
            title="Not part of this prototype"
            className={cn(ROW, "text-muted disabled:cursor-default")}
          >
            <Settings className="size-[22px] shrink-0" strokeWidth={1.8} />
            <span>Settings</span>
          </button>

          <div className="flex items-center gap-2.5 rounded-2xl bg-subtle p-3">
            <Image
              src={crest}
              alt=""
              className="size-11 shrink-0 object-contain"
            />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold text-ink">
                Delhi Public School
              </span>
              <span className="block truncate text-[13px] text-muted">
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
      <Icon className="size-[22px] shrink-0" strokeWidth={1.8} />
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
