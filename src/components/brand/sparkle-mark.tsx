import { cn } from "@/lib/cn";

/**
 * The sparkle on the AI Teacher's Toolkit pill, drawn from the design's own
 * exported asset rather than approximated with a Lucide glyph.
 *
 * It matters because the two do not agree: this is a large four-point star with
 * a smaller one set above and to its right, and `Sparkles` puts its companion
 * as a dot below and to the left. At 18px on the sidebar's most prominent
 * control that difference is visible, so the paths are the design's, verbatim.
 *
 * The viewBox is the asset's own 18.316 x 17.316 — deliberately not squared off
 * to 18x18, because the star sits off-centre in it and normalising the box
 * would shift the glyph inside the pill.
 */
export function SparkleMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 18.3162 17.3162"
      fill="currentColor"
      aria-hidden="true"
      className={cn("h-[17.32px] w-[18.32px] shrink-0", className)}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4.63783 8.63783L6.18377 4H7.13246L8.6784 8.63783L13.3162 10.1838V11.1325L8.6784 12.6784L7.13246 17.3162H6.18377L4.63783 12.6784L0 11.1325V10.1838L4.63783 8.63783Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M13.3878 2.38783L14.1838 0H15.1325L15.9284 2.38783L18.3162 3.18377V4.13246L15.9284 4.9284L15.1325 7.31623H14.1838L13.3878 4.9284L11 4.13246V3.18377L13.3878 2.38783Z"
      />
    </svg>
  );
}
