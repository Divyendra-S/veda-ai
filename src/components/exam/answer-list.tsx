import type { AnswerRecord, QuestionRecord } from "@/lib/exam/types";

/**
 * The extracted answers, in the order they were written.
 *
 * The region count is shown rather than hidden because it is the visible proof
 * of the one thing extraction has to get right that a transcript alone will not
 * show: an answer that ran across a page break is one answer with two regions,
 * not two answers.
 *
 * The question each block was matched to is shown here too, and so is the fact
 * that a block matched nothing. A block the pipeline could not place is the
 * case most likely to be wrong, so it is the one that must not be quietly
 * dropped from the list.
 */
export function AnswerList({
  answers,
  questions = [],
}: {
  answers: AnswerRecord[];
  questions?: QuestionRecord[];
}) {
  const byId = new Map(questions.map((question) => [question.id, question]));

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
          <p className="mt-1 text-[12px] font-medium text-muted">
            {answer.questionId
              ? `answers question ${byId.get(answer.questionId)?.number ?? "?"}`
              : "matches no question on this paper"}
          </p>
          <p className="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-ink-soft">
            {answer.transcript}
          </p>
        </li>
      ))}
    </ol>
  );
}
