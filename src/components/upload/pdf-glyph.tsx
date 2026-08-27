import { cn } from "@/lib/cn";

/** The red PDF document mark from the filled-state export. */
export function PdfGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 48" aria-hidden className={cn("shrink-0", className)}>
      <path
        d="M0 6a6 6 0 0 1 6-6h18l16 16v26a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6V6Z"
        fill="#de544f"
      />
      <path d="M24 0l16 16H28a4 4 0 0 1-4-4V0Z" fill="#fff" fillOpacity="0.32" />
      <text
        x="20"
        y="38"
        textAnchor="middle"
        fill="#fff"
        fontSize="13"
        fontWeight="700"
        letterSpacing="0.2"
        fontFamily="inherit"
      >
        PDF
      </text>
    </svg>
  );
}
