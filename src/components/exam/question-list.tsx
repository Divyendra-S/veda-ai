import { cn } from "@/lib/cn";
import type { GradingRecord, QuestionRecord, Verdict } from "@/lib/exam/types";

/**
 * The extracted register, with each question's mark and feedback beside it.
 *
 * The three label fields are rendered separately on purpose: the badge shows
 * the whole-question number, the part letter sits beside it, and the full
 * printed label stays available as the row's accessible name. That is what
 * makes "11 (a)" and "11 (b)" read as two parts of one question rather than as
 * two unrelated rows.
 *
 * Phase 7 replaces this with the designed screen; what it has to keep is that a
 * question the student skipped still gets a row and still says so, because a
 * silently missing question is the failure a teacher would never catch.
 */

const VERDICT_STYLE: Record<Verdict, string> = {
  correct: "bg-pass-bg text-pass",
  partial: "bg-warn-bg text-warn",
  incorrect: "bg-fail-bg text-fail",
  unanswered: "bg-well text-muted",
};

const VERDICT_LABEL: Record<Verdict, string> = {
  correct: "Correct",
  partial: "Partial",
  incorrect: "Incorrect",
  unanswered: "Not attempted",
};

export function QuestionList({
  questions,
  gradings = [],
}: {
  questions: QuestionRecord[];
  gradings?: GradingRecord[];
}) {
  const byQuestion = new Map(gradings.map((grading) => [grading.questionId, grading]));

  return (
    <ol className="flex flex-col gap-2.5">
      {questions.map((question, index) => {
        const isPart = Boolean(question.partLabel);
        const startsGroup =
          index === 0 ||
          questions[index - 1].parentNumber !== question.parentNumber;
        const grading = byQuestion.get(question.id);

        return (
          <li
            key={question.id}
            aria-label={`Question ${question.number}`}
            className={cn(
              "flex gap-3 rounded-card border border-line/60 bg-surface p-3.5",
              isPart && !startsGroup && "ml-6",
            )}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-white tabular-nums">
              {question.parentNumber}
            </span>

            {isPart ? (
              <span className="mt-1.5 w-4 shrink-0 text-[13px] font-semibold text-muted">
                {question.partLabel}
              </span>
            ) : null}

            <div className="min-w-0 flex-1">
              <p className="text-[15px] leading-relaxed text-ink-soft">
                {question.text}
              </p>

              {grading ? (
                <div className="mt-2.5 flex flex-wrap items-baseline gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[12px] font-semibold",
                      VERDICT_STYLE[grading.verdict],
                    )}
                  >
                    {VERDICT_LABEL[grading.verdict]}
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums text-ink">
                    {grading.marksAwarded}/{grading.maxMarks}
                  </span>
                  {grading.feedback ? (
                    <p className="w-full text-[13px] leading-relaxed text-muted">
                      {grading.feedback}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <span className="mt-1 shrink-0 text-[13px] tabular-nums text-muted">
              {question.maxMarks === null ? "—" : `${question.maxMarks} marks`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
