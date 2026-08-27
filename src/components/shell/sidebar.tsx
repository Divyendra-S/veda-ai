"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsRight, PanelLeft, Settings, Sparkles } from "lucide-react";
import crest from "@/assets/brand/school-crest.png";
import { LogoMark } from "@/components/brand/logo-mark";
import { NAV_ITEMS, type NavItem } from "@/components/shell/nav-items";
import { useSidebar } from "@/components/shell/use-sidebar";
import { cn } from "@/lib/cn";

const ROW =
  "flex h-10 items-center gap-3 rounded-xl px-3 text-[15px] transition-colors " +
  "rail:mx-auto rail:size-10 rail:justify-center rail:gap-0 rail:px-0";

export function Sidebar() {
  const { collapsed, toggle } = useSidebar();
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col overflow-hidden bg-surface shadow-card",
        "w-(--spacing-sidebar) rounded-[28px] px-6 pt-6 pb-6",
        "rail:w-(--spacing-rail) rail:px-2",
        "transition-[width] duration-200 ease-out",
      )}
    >
      <div className="flex items-center gap-2.5 rail:justify-center">
        <LogoMark className="size-10" />
        <span className="text-[21px] font-bold tracking-[-0.02em] text-ink rail:hidden">
          VedaAI
        </span>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label="Collapse sidebar"
          className="ml-auto grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink rail:hidden"
        >
          <PanelLeft className="size-5" strokeWidth={1.8} />
        </button>
      </div>

      <button
        type="button"
        className={cn(
          "mt-[53px] flex items-center justify-center gap-2 rounded-full border-2 border-brand-ring bg-ink",
          "h-12 text-[15px] font-medium text-white transition-transform active:scale-[0.99]",
          "rail:mx-auto rail:size-10 rail:p-0",
        )}
      >
        <Sparkles className="size-[18px] shrink-0 fill-white" strokeWidth={0} />
        <span className="rail:hidden">AI Teacher&apos;s Toolkit</span>
      </button>

      <nav className="mt-[52px] flex flex-col gap-1.5">
        {NAV_ITEMS.map((item) => (
          <NavRow
            key={item.label}
            item={item}
            active={item.href ? pathname.startsWith(item.href) : false}
          />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3 pt-8">
        <button
          type="button"
          disabled
          title="Not part of this prototype"
          className={cn(ROW, "text-muted disabled:cursor-default rail:hidden")}
        >
          <Settings className="size-[22px] shrink-0" strokeWidth={1.8} />
          <span>Settings</span>
        </button>

        <div className="flex items-center gap-2.5 rounded-2xl bg-subtle p-3 rail:mx-auto rail:rounded-xl rail:p-1.5">
          <Image
            src={crest}
            alt=""
            className="size-12 shrink-0 object-contain rail:size-9"
          />
          <span className="min-w-0 rail:hidden">
            <span className="block truncate text-[15px] font-semibold text-ink">
              Delhi Public School
            </span>
            <span className="block truncate text-[13px] text-muted">
              Bokaro Steel City
            </span>
          </span>
        </div>

        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label="Expand sidebar"
          className="mx-auto hidden size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink rail:grid"
        >
          <ChevronsRight className="size-5" strokeWidth={2} />
        </button>
      </div>
    </aside>
  );
}

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const content = (
    <>
      <Icon className="size-[22px] shrink-0" strokeWidth={1.8} />
      <span className="rail:hidden">{item.label}</span>
    </>
  );

  // Everything except Exams is inert. The brief allows it, and the design shows
  // the items, so they stay visible — but as disabled buttons rather than dead
  // links, so nothing announces them as navigable or takes focus.
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
      aria-current={active ? "page" : undefined}
      title={item.label}
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
