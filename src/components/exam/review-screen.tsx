"use client";

import Image from "next/image";
import { ProcessingPanel } from "@/components/processing-panel";
import { Button } from "@/components/ui/button";
import { QuestionList } from "@/components/exam/question-list";
import { useExamPipeline } from "@/hooks/use-exam-pipeline";
import type { ExamStage } from "@/lib/exam/types";

/**
 * The review screen, as far as Phase 4 takes it: the extracted register on the
 * left, the answer sheet on the right, and the loading and error states in
 * between. Phase 7 replaces it with the designed version — selection, score
 * pills, AI feedback, the zoomable viewer and the highlight overlay. What is
 * here already proves the parts those depend on: the poll reflects real stage,
 * and a private page renders through a signed URL at the size the model saw.
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
        <header className="flex items-baseline justify-between border-b border-line/60 px-5 py-4">
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
        <div className="scrollbar-slim flex-1 overflow-y-auto p-4">
          <QuestionList questions={exam.questions} />
        </div>
      </section>

      <section className="flex w-[46%] min-w-0 flex-col rounded-panel bg-viewer shadow-card">
        <header className="flex items-baseline justify-between px-5 py-4">
          <h2 className="text-[17px] font-semibold text-white">Answer Sheet</h2>
          <span className="text-[13px] tabular-nums text-white/60">
            {exam.answerSheet.pages.length} page(s)
          </span>
        </header>
        <div className="scrollbar-slim-dark flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          {exam.answerSheet.pages.map((page) => (
            <Image
              key={page.index}
              src={page.url}
              alt={`Answer sheet page ${page.index + 1}`}
              width={page.width}
              height={page.height}
              unoptimized
              className="w-full rounded-lg bg-white"
            />
          ))}
        </div>
      </section>
    </div>
  );
}
