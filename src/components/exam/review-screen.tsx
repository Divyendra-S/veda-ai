"use client";

import { useMemo, useState } from "react";
import { ProcessingPanel } from "@/components/processing-panel";
import { Button } from "@/components/ui/button";
import {
  AnswerSheetPanel,
  type Focus,
} from "@/components/exam/answer-sheet-panel";
import { QuestionPanel } from "@/components/exam/question-panel";
import { useExamPipeline } from "@/hooks/use-exam-pipeline";
import { buildReview, type PlacedRegion, type Target } from "@/lib/exam/review-model";
import type { ExamStage } from "@/lib/exam/types";

/**
 * Page 2: the register on the left, the answer sheet on the right, and one
 * click connecting them.
 *
 * Selection is held here as a key rather than as the selected object, and the
 * object is looked up again from the current model on every render. A poll
 * that replaces the snapshot then cannot leave the viewer drawing boxes from a
 * payload the list has already moved on from.
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
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);

  const model = useMemo(() => (exam ? buildReview(exam) : null), [exam]);
  const target = useMemo(() => {
    if (!model || !selectedKey) return null;
    return (
      model.rows.find((row) => row.target.key === selectedKey)?.target ??
      model.unmatched.find((entry) => entry.target.key === selectedKey)
        ?.target ??
      null
    );
  }, [model, selectedKey]);

  // The token climbs on every click so that re-selecting the question already
  // showing scrolls to it again rather than silently doing nothing.
  const select = (chosen: Target, region: PlacedRegion | null) => {
    setSelectedKey(chosen.key);
    setFocus((current) =>
      region ? { regionId: region.id, token: (current?.token ?? 0) + 1 } : null,
    );
  };

  if (isLoading || !exam || !model) {
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
        detail={`${exam.progress}% · ${exam.answerSheet.pages.length} answer page(s)`}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      <QuestionPanel
        model={model}
        summary={exam.summary}
        selectedKey={selectedKey}
        onSelect={select}
      />
      <AnswerSheetPanel
        pages={exam.answerSheet.pages}
        target={target}
        focus={focus}
      />
    </div>
  );
}
