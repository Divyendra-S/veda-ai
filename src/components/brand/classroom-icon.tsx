import type { SVGProps } from "react";

/**
 * "My Classroom" has no Lucide equivalent — the design draws it as a solid tile
 * with a figure and a pointer knocked out of it. Hand-drawn to match: one path,
 * evenodd, so the cut-outs track `currentColor` like every other nav icon.
 */
export function ClassroomIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4.5 3.5h15a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Zm10.9 3.1a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2ZM5.6 4.9 4.2 6.3l7.6 7.6 1.4-1.4L5.6 4.9Zm9.8 6.9a3.6 3.6 0 0 0-3.6 3.6v2.1h7.2v-2.1a3.6 3.6 0 0 0-3.6-3.6Z"
      />
    </svg>
  );
}
