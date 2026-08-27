import { cn } from "@/lib/cn";
import type { QuestionRecord } from "@/lib/exam/types";

/**
 * The extracted register.
 *
 * The three label fields are rendered separately on purpose: the badge shows
 * the whole-question number, the part letter sits beside it, and the full
 * printed label stays available as the row's accessible name. That is what
 * makes "11 (a)" and "11 (b)" read as two parts of one question rather than as
 * two unrelated rows.
 */
export function QuestionList({ questions }: { questions: QuestionRecord[] }) {
  return (
    <ol className="flex flex-col gap-2.5">
      {questions.map((question, index) => {
        const isPart = Boolean(question.partLabel);
        const startsGroup =
          index === 0 ||
          questions[index - 1].parentNumber !== question.parentNumber;

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

            <p className="min-w-0 flex-1 text-[15px] leading-relaxed text-ink-soft">
              {question.text}
            </p>

            <span className="mt-1 shrink-0 text-[13px] tabular-nums text-muted">
              {question.maxMarks === null ? "—" : `${question.maxMarks} marks`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
