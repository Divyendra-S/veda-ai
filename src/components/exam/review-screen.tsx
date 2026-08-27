"use client";

import { ProcessingPanel } from "@/components/processing-panel";
import { Button } from "@/components/ui/button";
import { AnswerList } from "@/components/exam/answer-list";
import { AnswerSheetViewer } from "@/components/exam/answer-sheet-viewer";
import { QuestionList } from "@/components/exam/question-list";
import { useExamPipeline } from "@/hooks/use-exam-pipeline";
import type { ExamStage } from "@/lib/exam/types";

/**
 * The review screen, as far as Phases 4 to 6 take it: what was extracted and
 * what it scored on the left, the answer sheet with its regions drawn on it on
 * the right, and the loading and error states in between. Phase 7 replaces it
 * with the designed version — selection, score pills, the zoomable viewer and
 * click-to-highlight. What is here already proves the parts those depend on:
 * the poll reflects real stage, a private page renders through a signed URL at
 * the size the model saw, a normalised box lands on the right handwriting, and
 * the marks on screen add up to the total printed above them.
 */

const STAGE_TITLES: Record<ExamStage, string> = {
  queued: "Getting started…",
  questions: "Reading the question paper…",
  answers: "Reading the answer sheet…",
  mapping: "Matching answers to questions…",
  grading: "Grading…",
  done: "Done",
};

export function ReviewScreen({ examId }: { examId: string }) {
  const { exam, isLoading, error, retry } = useExamPipeline(examId);

  if (isLoading || !exam) {
    return <ProcessingPanel title="Opening…" subtitle="One moment" />;
  }

  if (exam.status === "error" || error) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-4 rounded-panel bg-surface p-10 text-center shadow-card">
        <h1 className="text-[28px] font-bold tracking-[-0.02em] text-ink">
          Extraction failed
        </h1>
        <p className="max-w-[520px] text-[15px] text-muted">
          {exam.error ?? (error instanceof Error ? error.message : "")}
        </p>
        <Button onClick={retry}>Try again</Button>
      </section>
    );
  }

  if (exam.status !== "done") {
    return (
      <ProcessingPanel
        title={STAGE_TITLES[exam.stage]}
        detail={`${exam.questionPaper.pages.length} page(s) · ${exam.questionPaper.name}`}
      />
    );
  }

  return (
    <div className="flex flex-1 gap-3 overflow-hidden">
      <section className="flex min-w-0 flex-1 flex-col rounded-panel bg-surface shadow-card">
        <div className="scrollbar-slim flex-1 overflow-y-auto">
          {exam.summary ? (
            <div className="border-b border-line/60 bg-well px-5 py-4">
              <div className="flex items-baseline gap-3">
                <span className="text-[28px] font-bold leading-none tracking-[-0.02em] text-ink tabular-nums">
                  {exam.summary.awardedMarks}
                  <span className="text-[18px] text-muted">
                    /{exam.summary.totalMarks}
                  </span>
                </span>
                <span className="text-[15px] font-semibold tabular-nums text-brand">
                  {exam.summary.percentage}%
                </span>
                <span className="ml-auto text-[13px] tabular-nums text-muted">
                  {exam.summary.answered} answered · {exam.summary.unanswered}{" "}
                  skipped · {exam.summary.unmatched} unplaceable
                </span>
              </div>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
                {exam.summary.overallFeedback}
              </p>
              {exam.summary.strengths.length > 0 ||
              exam.summary.gaps.length > 0 ? (
                <dl className="mt-2.5 grid gap-1 text-[13px] leading-relaxed sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-pass">Strengths</dt>
                    <dd className="text-muted">
                      {exam.summary.strengths.join(" · ") || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-warn">To work on</dt>
                    <dd className="text-muted">
                      {exam.summary.gaps.join(" · ") || "—"}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </div>
          ) : null}

          <header className="sticky top-0 z-10 flex items-baseline justify-between border-b border-line/60 bg-surface px-5 py-4">
            <h1 className="text-[17px] font-semibold text-ink">
              Extracted Questions
              <span className="ml-2 text-[13px] font-normal text-muted">
                from question paper
              </span>
            </h1>
            <span className="text-[13px] tabular-nums text-muted">
              {exam.questions.length} questions
            </span>
          </header>
          <div className="p-4">
            <QuestionList questions={exam.questions} gradings={exam.gradings} />
          </div>

          <header className="sticky top-0 z-10 flex items-baseline justify-between border-y border-line/60 bg-surface px-5 py-4">
            <h2 className="text-[17px] font-semibold text-ink">
              Extracted Answers
              <span className="ml-2 text-[13px] font-normal text-muted">
                in the order written
              </span>
            </h2>
            <span className="text-[13px] tabular-nums text-muted">
              {exam.answers.length} answers
            </span>
          </header>
          <div className="p-4">
            <AnswerList answers={exam.answers} questions={exam.questions} />
          </div>
        </div>
      </section>

      <section className="flex w-[46%] min-w-0 flex-col rounded-panel bg-viewer shadow-card">
        <header className="flex items-baseline justify-between px-5 py-4">
          <h2 className="text-[17px] font-semibold text-white">Answer Sheet</h2>
          <span className="text-[13px] tabular-nums text-white/60">
            {exam.answerSheet.pages.length} page(s)
          </span>
        </header>
        <div className="scrollbar-slim-dark flex-1 overflow-y-auto px-4 pb-4">
          <AnswerSheetViewer
            pages={exam.answerSheet.pages}
            answers={exam.answers}
          />
        </div>
      </section>
    </div>
  );
}
