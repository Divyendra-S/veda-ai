"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  Bell,
  ChevronDown,
  Clipboard,
  HelpCircle,
  Menu,
  Sparkles,
} from "lucide-react";
import avatar from "@/assets/brand/avatar.png";
import { cn } from "@/lib/cn";
import { LogoMark } from "@/components/brand/logo-mark";
import { MobileNav } from "@/components/shell/mobile-nav";

/** Presentational only — this app has no authentication. See docs/DESIGN.md. */
const TEACHER = "Madhur Rastogi";

export function Topbar({ section = "Exams" }: { section?: string }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);

  return (
    <header className="flex h-(--spacing-topbar) shrink-0 items-center gap-2 rounded-shell bg-raised pl-3 pr-4 shadow-card sm:gap-3 sm:px-5">
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Go back"
        className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-ink transition-colors hover:bg-subtle sm:border sm:border-black/8 sm:bg-white"
      >
        <ArrowLeft className="size-6 sm:size-[18px]" strokeWidth={2} />
      </button>

      {/* The phone frame swaps the breadcrumb for the brand, because with no
          sidebar beside it the topbar is the only place the app says its own
          name. From `sm` up the sidebar carries the brand and this goes back to
          saying where you are. Its metrics are the node's: a 28px mark, the
          wordmark at 20px and -6%, and 24px icons throughout — bigger glyphs
          than the desktop bar carries, which is right for a thumb. */}
      <span className="flex min-w-0 items-center gap-2 sm:hidden">
        <LogoMark className="size-7 shrink-0" />
        <span className="truncate text-[20px] font-bold tracking-[-0.06em] text-ink">
          VedaAI
        </span>
      </span>

      <span className="hidden min-w-0 items-center gap-2 text-[15px] text-muted sm:flex">
        <Clipboard className="size-[18px] shrink-0" strokeWidth={1.8} />
        <span className="truncate">{section}</span>
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-1.5">
        <IconButton label="Help" className="hidden sm:grid">
          <HelpCircle className="size-[19px]" strokeWidth={1.8} />
        </IconButton>

        <IconButton label="Notifications">
          <span className="relative">
            <Bell className="size-6 sm:size-[19px]" strokeWidth={1.8} />
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-brand ring-2 ring-raised" />
          </span>
        </IconButton>

        <button
          type="button"
          aria-label="Assistant"
          className="hidden size-9 cursor-pointer place-items-center rounded-full border border-black/8 bg-white text-ink transition-colors hover:bg-subtle sm:grid"
        >
          <Sparkles className="size-[18px] fill-ink" strokeWidth={0} />
        </button>

        <button
          type="button"
          className="flex items-center gap-2 rounded-full text-left sm:ml-1.5"
        >
          <Image
            src={avatar}
            alt=""
            className="size-8 shrink-0 rounded-full object-cover sm:size-7"
          />
          <span className="hidden text-[15px] font-medium text-ink sm:block">
            {TEACHER}
          </span>
          <ChevronDown
            className="hidden size-4 text-muted sm:block"
            strokeWidth={2}
          />
        </button>

        <button
          type="button"
          onClick={() => setMenu(true)}
          aria-label="Open menu"
          aria-expanded={menu}
          className="grid size-9 cursor-pointer place-items-center rounded-full text-ink transition-colors hover:bg-subtle sm:hidden"
        >
          <Menu className="size-6" strokeWidth={2} />
        </button>
      </div>

      <MobileNav open={menu} onClose={() => setMenu(false)} />
    </header>
  );
}

function IconButton({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "grid size-9 cursor-pointer place-items-center rounded-full text-ink transition-colors hover:bg-subtle",
        className,
      )}
    >
      {children}
    </button>
  );
}
