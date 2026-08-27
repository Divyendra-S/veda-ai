"use client";

import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { ScorePill } from "@/components/exam/score-pill";
import {
  displayNumber,
  type PlacedRegion,
  type ReviewRow,
} from "@/lib/exam/review-model";

/**
 * One question in the left panel.
 *
 * Selection and expansion are two things, because the design shows them as
 * two: row 2 in the export carries the orange border *and* an open feedback
 * block, while row 6 is open without being selected. So the row body selects
 * (and highlights on the sheet) and the chevron alone expands. They are
 * separate buttons rather than one button reading a modifier key, which also
 * keeps the markup valid — a button cannot sit inside a button.
 *
 * A question nobody answered still gets a full row. Dropping it would hide the
 * one failure a teacher scanning this list could never catch by eye.
 */
export function QuestionRow({
  row,
  selected,
  expanded,
  onSelect,
  onToggle,
  onFocusRegion,
}: {
  row: ReviewRow;
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onFocusRegion: (region: PlacedRegion) => void;
}) {
  const bodyId = useId();
  const { question, grading, answers, target } = row;
  const unanswered = target.regions.length === 0;

  return (
    <li
      className={cn(
        "rounded-card border-2 bg-surface shadow-card transition-colors",
        selected ? "border-brand-soft" : "border-transparent",
        row.isPart && !row.startsGroup && "ml-7",
      )}
    >
      {/* Two layouts out of one set of children, because the phone frame
          rearranges rather than shrinks: there the number and the mark sit on a
          line of their own with the chevron, and the question runs the full
          width underneath. `flex-wrap` plus `order`/`basis` says that without a
          second copy of the markup, and `sm:flex-nowrap` collapses it back to
          the single row the desktop frame draws. `items-start` is what keeps
          the chevron level with the number rather than floating halfway down a
          two-line card. */}
      <div className="flex items-start gap-3 p-3 sm:items-center">
        <button
          type="button"
          data-row
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={`Question ${question.number}`}
          className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-3 gap-y-2.5 rounded-[10px] text-left outline-offset-4 focus-visible:outline-2 focus-visible:outline-brand sm:flex-nowrap sm:gap-y-0"
        >
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold tabular-nums text-white transition-colors",
              selected ? "bg-brand" : "bg-badge",
            )}
          >
            {displayNumber(question.parentNumber)}
          </span>

          {row.isPart ? (
            <span className="w-4 shrink-0 text-[13px] font-semibold text-ink">
              {question.partLabel}.
            </span>
          ) : null}

          {/* Every row in the export is one to three lines, and the paper it
              was drawn from asks short questions. A real one does not: an
              assertion-and-reason question prints its four options in full and
              turns a card into a wall, which is a list nobody scans. So the
              collapsed row keeps the design's rhythm and the chevron — which
              already opens the answer and the feedback — opens the rest of the
              question with them. Nothing is hidden that a click does not
              return. */}
          <span
            className={cn(
              "order-last min-w-0 basis-full text-[14px] leading-[1.55] text-ink-soft sm:order-none sm:basis-auto",
              // The export's rows are one to three lines because its paper asks
              // short questions. A real one prints all four options of an
              // assertion-and-reason item and turns the card into a wall, so a
              // collapsed row keeps the design's rhythm and the chevron — which
              // already opens the answer and the feedback — opens the rest of
              // the question with them.
              !expanded && "line-clamp-3",
            )}
          >
            {question.text}
          </span>

          <ScorePill grading={grading} className="ml-auto sm:ml-0" />
        </button>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={bodyId}
          aria-label={`${expanded ? "Hide" : "Show"} feedback for question ${question.number}`}
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-[10px] bg-inset text-muted transition-colors outline-offset-2 hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
        >
          <ChevronDown
            className={cn(
              "size-[18px] transition-transform duration-200",
              expanded && "rotate-180",
            )}
            strokeWidth={2}
          />
        </button>
      </div>

      {expanded ? (
        <div id={bodyId} className="px-3 pb-3">
          {unanswered ? (
            <p className="rounded-[12px] bg-inset px-3.5 py-3 text-[13px] leading-relaxed text-muted">
              Not attempted. Nothing on the answer sheet was matched to this
              question, so there is no region to show.
            </p>
          ) : (
            <>
              <div className="rounded-[12px] bg-inset px-3.5 py-3">
                <p className="text-[13px] font-semibold text-ink">
                  What the student wrote
                </p>
                {answers.map((answer) => (
                  <p
                    key={answer.id}
                    className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-ink-soft"
                  >
                    {answer.transcript}
                  </p>
                ))}

                {target.regions.length > 1 ? (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[12px] text-faint">
                      Runs across {target.regions.length} regions —
                    </span>
                    {target.regions.map((region) => (
                      <button
                        key={region.id}
                        type="button"
                        onClick={() => onFocusRegion(region)}
                        className="cursor-pointer rounded-full bg-surface px-2.5 py-1 text-[12px] font-medium tabular-nums text-ink shadow-card transition-colors hover:bg-subtle"
                      >
                        Page {region.pageIndex + 1}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {grading?.feedback ? (
                <div className="mt-2 rounded-[12px] bg-inset px-3.5 py-3">
                  <p className="text-[13px] font-semibold text-ink">
                    AI Feedback
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
                    {grading.feedback}
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}
