"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/** Four-point sparkle, centred on the origin with radius 1. */
const SPARKLE =
  "M0,-1 C0.08,-0.42 0.42,-0.08 1,0 C0.42,0.08 0.08,0.42 0,1 C-0.08,0.42 -0.42,0.08 -1,0 C-0.42,-0.08 -0.08,-0.42 0,-1 Z";

function SparkleCluster({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={className}>
      <defs>
        {/* The tips fade rather than ending hard, which is what gives the mark
            its glow against the white card. */}
        <radialGradient id="sparkle-fade">
          <stop offset="0%" stopColor="#ff6b3d" />
          <stop offset="42%" stopColor="#ff5724" />
          <stop offset="100%" stopColor="#ff5724" stopOpacity="0.12" />
        </radialGradient>
      </defs>
      <g fill="url(#sparkle-fade)">
        <path d={SPARKLE} transform="translate(53 37) scale(31)" />
        <path d={SPARKLE} transform="translate(31 69) scale(20)" />
        <path d={SPARKLE} transform="translate(69 70) scale(9)" />
        <circle cx="15" cy="40" r="4.6" />
      </g>
    </svg>
  );
}

/** How long a run has to be going before the wait is worth explaining. Under
 *  this, a note about rate limits reads as an apology for nothing. */
const SLOW_AFTER_MS = 45_000;

export function ProcessingPanel({
  title,
  subtitle = "This may take a while",
  detail,
  progress,
  slowNote,
  className,
}: {
  title: string;
  subtitle?: string;
  detail?: string | null;
  /** 0..100. Omitted while there is nothing honest to report. */
  progress?: number | null;
  /** Shown once the wait has gone on long enough to need explaining. */
  slowNote?: string;
  className?: string;
}) {
  const slow = useElapsedPast(SLOW_AFTER_MS, Boolean(slowNote));

  return (
    <section
      className={cn(
        "flex flex-1 flex-col items-center justify-center rounded-panel bg-surface px-6 text-center shadow-card",
        className,
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <SparkleCluster className="size-[104px] animate-shimmer sm:size-[136px]" />
      <h1 className="mt-6 text-[26px] font-bold tracking-[-0.02em] text-ink sm:text-[34px]">
        {title}
      </h1>
      <p className="mt-1.5 text-[16px] text-muted sm:text-[19px]">{subtitle}</p>

      {typeof progress === "number" ? (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-label={title}
          className="mt-6 h-1.5 w-full max-w-[260px] overflow-hidden rounded-full bg-subtle"
        >
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(3, progress))}%` }}
          />
        </div>
      ) : null}

      {detail ? (
        <p className="mt-4 text-[14px] tabular-nums text-faint">{detail}</p>
      ) : null}

      {slow && slowNote ? (
        <p className="mt-5 max-w-[380px] text-[13px] leading-relaxed text-faint">
          {slowNote}
        </p>
      ) : null}
    </section>
  );
}

/** True once `ms` has passed since this panel appeared. A timer rather than a
 *  timestamp threaded down from the caller, because what matters is how long
 *  the person has been looking at this screen. */
function useElapsedPast(ms: number, enabled: boolean) {
  const [past, setPast] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => setPast(true), ms);
    return () => clearTimeout(timer);
  }, [ms, enabled]);

  return past;
}
