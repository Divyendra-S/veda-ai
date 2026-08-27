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

export function ProcessingPanel({
  title,
  subtitle = "This may take a while",
  detail,
  className,
}: {
  title: string;
  subtitle?: string;
  detail?: string | null;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-1 flex-col items-center justify-center rounded-panel bg-surface shadow-card",
        className,
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <SparkleCluster className="size-[136px] animate-shimmer" />
      <h1 className="mt-6 text-[34px] font-bold tracking-[-0.02em] text-ink">
        {title}
      </h1>
      <p className="mt-1.5 text-[19px] text-muted">{subtitle}</p>
      {detail ? (
        <p className="mt-5 text-[14px] tabular-nums text-faint">{detail}</p>
      ) : null}
    </section>
  );
}
