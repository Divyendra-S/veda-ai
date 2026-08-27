import { cn } from "@/lib/cn";

/**
 * The VedaAI mark: a white "V" on a near-black squircle. Drawn rather than
 * exported as a raster so it stays crisp at the two sizes the design uses
 * (40px in the expanded sidebar, 36px in the collapsed rail).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      role="img"
      aria-label="VedaAI"
      className={cn("size-10 shrink-0", className)}
    >
      <defs>
        <linearGradient id="veda-v" x1="0.3" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#c9c9c9" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill="#2b2b2b" />
      {/* Scaled about the centre so the mark keeps the design's breathing room
          inside the squircle rather than filling it edge to edge. */}
      <g transform="translate(20 20) scale(0.88) translate(-20 -20)">
        <path
          d="M9.6 11.4h6.9l3.5 11.2 3.5-11.2h6.9l-7 17.1c-.5 1.2-1.6 1.9-3.4 1.9s-2.9-.7-3.4-1.9l-7-17.1Z"
          fill="url(#veda-v)"
        />
      </g>
    </svg>
  );
}
