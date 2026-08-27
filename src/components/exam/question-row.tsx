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
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={`Question ${question.number}`}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-[10px] text-left outline-offset-4"
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

          <span className="min-w-0 flex-1 text-[14px] leading-[1.55] text-ink-soft">
            {question.text}
          </span>

          <ScorePill grading={grading} />
        </button>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={bodyId}
          aria-label={`${expanded ? "Hide" : "Show"} feedback for question ${question.number}`}
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-[10px] bg-inset text-muted transition-colors hover:bg-subtle hover:text-ink"
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
