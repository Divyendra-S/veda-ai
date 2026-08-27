import type { AnswerRecord } from "@/lib/exam/types";

/**
 * The extracted answers, in the order they were written.
 *
 * The region count is shown rather than hidden because it is the visible proof
 * of the one thing this pass has to get right that a transcript alone will not
 * show: an answer that ran across a page break is one answer with two regions,
 * not two answers. Phase 6 fills in which question each of these belongs to.
 */
export function AnswerList({ answers }: { answers: AnswerRecord[] }) {
  return (
    <ol className="flex flex-col gap-2.5">
      {answers.map((answer, index) => (
        <li
          key={answer.id}
          className="rounded-card border border-line/60 bg-surface p-3.5"
        >
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold text-ink">
              {answer.labelWritten ?? `Unlabelled #${index + 1}`}
            </span>
            <span className="text-[12px] tabular-nums text-faint">
              {answer.regions.length === 1
                ? `page ${answer.regions[0].pageIndex + 1}`
                : answer.regions.length === 0
                  ? "no region"
                  : `${answer.regions.length} regions · pages ${answer.regions
                      .map((region) => region.pageIndex + 1)
                      .join(", ")}`}
            </span>
            {answer.confidence !== null ? (
              <span className="ml-auto text-[12px] tabular-nums text-faint">
                {Math.round(answer.confidence * 100)}%
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-ink-soft">
            {answer.transcript}
          </p>
        </li>
      ))}
    </ol>
  );
}
