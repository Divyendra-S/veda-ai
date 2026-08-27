import { cn } from "@/lib/cn";
import { formatMarks, toneFor, type Tone } from "@/lib/exam/review-model";
import type { GradingRecord } from "@/lib/exam/types";

const TONE: Record<Tone, string> = {
  pass: "bg-pass-bg text-pass",
  warn: "bg-warn-bg text-warn",
  fail: "bg-fail-bg text-fail",
  none: "bg-inset text-muted",
};

/**
 * The mark, as the design draws it: a coloured pill reading `4/5`.
 *
 * The pill carries the number and the colour and nothing else, so the two can
 * never disagree — there is no separate verdict word beside it to fall out of
 * step. The accessible name spells out what the slash means, which a screen
 * reader would otherwise announce as "four five".
 */
export function ScorePill({
  grading,
  className,
}: {
  grading: GradingRecord | null;
  className?: string;
}) {
  const shape =
    "shrink-0 rounded-full px-2.5 py-1 text-[13px] font-semibold tabular-nums";

  if (!grading) {
    return (
      <span
        className={cn(shape, "bg-inset text-faint", className)}
        aria-label="Not graded"
      >
        &mdash;
      </span>
    );
  }

  const unanswered = grading.verdict === "unanswered";

  return (
    <span
      className={cn(shape, TONE[toneFor(grading)], className)}
      aria-label={
        unanswered
          ? `Not attempted, worth ${formatMarks(grading.maxMarks)} marks`
          : `${formatMarks(grading.marksAwarded)} out of ${formatMarks(grading.maxMarks)} marks`
      }
    >
      <span aria-hidden>
        {formatMarks(grading.marksAwarded)}/{formatMarks(grading.maxMarks)}
      </span>
    </span>
  );
}
