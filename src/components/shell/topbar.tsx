"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  ChevronDown,
  Clipboard,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import avatar from "@/assets/brand/avatar.png";

/** Presentational only — this app has no authentication. See docs/DESIGN.md. */
const TEACHER = "Madhur Rastogi";

export function Topbar({ section = "Exams" }: { section?: string }) {
  const router = useRouter();

  return (
    <header className="flex h-(--spacing-topbar) shrink-0 items-center gap-3 rounded-[22px] bg-raised px-5 shadow-card">
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Go back"
        className="grid size-9 shrink-0 place-items-center rounded-full border border-black/8 bg-white text-ink transition-colors hover:bg-subtle"
      >
        <ArrowLeft className="size-[18px]" strokeWidth={2} />
      </button>

      <span className="flex min-w-0 items-center gap-2 text-[15px] text-muted">
        <Clipboard className="size-[18px] shrink-0" strokeWidth={1.8} />
        <span className="truncate">{section}</span>
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <IconButton label="Help">
          <HelpCircle className="size-[19px]" strokeWidth={1.8} />
        </IconButton>

        <IconButton label="Notifications">
          <span className="relative">
            <Bell className="size-[19px]" strokeWidth={1.8} />
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-brand ring-2 ring-raised" />
          </span>
        </IconButton>

        <button
          type="button"
          aria-label="Assistant"
          className="grid size-9 place-items-center rounded-full border border-black/8 bg-white text-ink transition-colors hover:bg-subtle"
        >
          <Sparkles className="size-[18px] fill-ink" strokeWidth={0} />
        </button>

        <button
          type="button"
          className="ml-1.5 flex items-center gap-2 rounded-full text-left"
        >
          <Image
            src={avatar}
            alt=""
            className="size-7 shrink-0 rounded-full object-cover"
          />
          <span className="hidden text-[15px] font-medium text-ink sm:block">
            {TEACHER}
          </span>
          <ChevronDown className="size-4 text-muted" strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}

function IconButton({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="grid size-9 place-items-center rounded-full text-ink transition-colors hover:bg-subtle"
    >
      {children}
    </button>
  );
}
