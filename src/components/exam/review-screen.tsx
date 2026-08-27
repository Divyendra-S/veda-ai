"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, FileText, ImageIcon, RotateCw } from "lucide-react";
import { ProcessingPanel } from "@/components/processing-panel";
import { Button } from "@/components/ui/button";
import {
  AnswerSheetPanel,
  type Focus,
} from "@/components/exam/answer-sheet-panel";
import { QuestionPanel } from "@/components/exam/question-panel";
import { useExamPipeline } from "@/hooks/use-exam-pipeline";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";
import {
  buildReview,
  type PlacedRegion,
  type Target,
} from "@/lib/exam/review-model";
import type { ExamStage } from "@/lib/exam/types";

/**
 * Page 2: the register on the left, the answer sheet on the right, and one
 * click connecting them.
 *
 * Selection is held here as a key rather than as the selected object, and the
 * object is looked up again from the current model on every render. A poll
 * that replaces the snapshot then cannot leave the viewer drawing boxes from a
 * payload the list has already moved on from.
 *
 * A failed run does not necessarily mean an empty screen. The pipeline
 * persists each step's output before starting the next, so a run that died at
 * grading still has a full register, real answers and working highlights — and
 * throwing that away to show one error message would be both a worse screen
 * and a dishonest one. What failed goes in a banner over what survived.
 */

const STAGE_TITLES: Record<ExamStage, string> = {
  queued: "Getting started…",
  questions: "Reading the question paper and answer sheet…",
  answers: "Reading the answer sheet…",
  mapping: "Matching answers to questions…",
  grading: "Grading…",
  done: "Done",
};

const STAGE_FAILED: Record<ExamStage, string> = {
  queued: "The run never started.",
  questions: "Reading the question paper failed.",
  answers: "Reading the answer sheet failed.",
  mapping: "Matching answers to questions failed.",
  grading: "Grading failed.",
  done: "The run failed.",
};

/** What is still true when a stage fails, named honestly. Absent for the
 *  stages that leave nothing behind. */
const STAGE_SURVIVES: Partial<Record<ExamStage, string>> = {
  answers:
    "The questions below are complete. Nothing was read from the answer sheet.",
  mapping:
    "The questions and answers below are complete, but nothing has been matched to a question or marked.",
  grading:
    "The questions, answers and highlights below are complete — only the marks and feedback are missing.",
};

/** Below this the two panes stop being two panes. 1024px is where the question
 *  text and a legible page stop both fitting, measured rather than picked. */
const NARROW = "(max-width: 1023.98px)";

export function ReviewScreen({ examId }: { examId: string }) {
  const { exam, isLoading, error, retry, reload } = useExamPipeline(examId);
  const narrow = useMediaQuery(NARROW);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [pane, setPane] = useState<"questions" | "sheet">("questions");
  const [announcement, setAnnouncement] = useState("");

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

    // On one pane, selecting has to take you to the thing you selected —
    // otherwise the highlight is drawn on a panel nobody can see.
    if (region && narrow) setPane("sheet");

    // Spoken, because the highlight itself is not: the box appears in a panel
    // a screen-reader user is not looking at and has no announcement of its own.
    setAnnouncement(
      region
        ? `${chosen.tag} highlighted on page ${region.pageIndex + 1}${
            region.total > 1 ? `, region ${region.ordinal} of ${region.total}` : ""
          }.`
        : `${chosen.tag} was not attempted. There is nothing on the answer sheet to highlight.`,
    );
  };

  // The snapshot itself would not load. There is no run to resume and no
  // partial screen to show, so this is the one place that offers a re-read
  // rather than a retry — and it has to be offered, because the alternative is
  // a spinner that never resolves and never says why.
  if (!exam || !model) {
    if (!isLoading && error) {
      return (
        <FailurePanel
          title="Could not open this exam."
          message={error instanceof Error ? error.message : null}
          onRetry={reload}
          actionLabel="Try again"
          note="The link may be wrong, or the exam may have been created on a different environment."
        />
      );
    }
    return <ProcessingPanel title="Opening…" subtitle="One moment" />;
  }

  const clientError = error instanceof Error ? error.message : null;
  const failed = exam.status === "error" || Boolean(error);
  const failure = exam.error ?? clientError;
  const survives = STAGE_SURVIVES[exam.stage];

  // Nothing was extracted before it broke, so there is no screen to show and a
  // banner would be sitting on top of an empty one.
  if (failed && model.rows.length === 0) {
    return (
      <FailurePanel
        title={STAGE_FAILED[exam.stage]}
        message={failure}
        onRetry={retry}
        actionLabel="Try again"
        note="Retrying picks up at the step that failed. Nothing is uploaded again."
      />
    );
  }

  if (!failed && exam.status !== "done") {
    return (
      <ProcessingPanel
        title={STAGE_TITLES[exam.stage]}
        progress={exam.progress}
        detail={`${exam.answerSheet.pages.length} answer page${
          exam.answerSheet.pages.length === 1 ? "" : "s"
        } · ${exam.questionPaper.pages.length} question page${
          exam.questionPaper.pages.length === 1 ? "" : "s"
        }`}
        slowNote="Still going. This runs on a tier-1 Gemini key, so requests are paced rather than fired all at once and part of the wait is the run holding for its next slot. A two-page pair takes about a minute and a half."
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {failed ? (
        <div
          role="alert"
          className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-[18px] bg-warn-bg px-4 py-3 shadow-card"
        >
          <AlertTriangle className="size-[18px] shrink-0 text-warn" strokeWidth={2.2} />
          <span className="text-[14px] font-semibold text-warn">
            {STAGE_FAILED[exam.stage]}
          </span>
          <span className="min-w-0 flex-1 text-[13px] text-ink-soft">
            {survives ?? failure}
          </span>
          <button
            type="button"
            onClick={retry}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-warn px-3.5 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          >
            <RotateCw className="size-[14px]" strokeWidth={2.4} />
            Retry this step
          </button>
        </div>
      ) : null}

      {narrow ? (
        <PaneSwitch
          pane={pane}
          onChange={setPane}
          sheetBadge={target?.regions.length ?? 0}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 gap-3">
        <QuestionPanel
          model={model}
          summary={exam.summary}
          selectedKey={selectedKey}
          onSelect={select}
          className={cn(narrow && pane !== "questions" && "hidden")}
        />
        <AnswerSheetPanel
          pages={exam.answerSheet.pages}
          target={target}
          focus={focus}
          className={cn(narrow && pane !== "sheet" && "hidden")}
        />
      </div>
    </div>
  );
}

/** One shape for every dead end: what broke, what it said, and the one action
 *  worth offering. Both callers need the same thing, and two of these drifting
 *  apart is how an error screen ends up lying about what a button does. */
function FailurePanel({
  title,
  message,
  actionLabel,
  onRetry,
  note,
}: {
  title: string;
  message: string | null;
  actionLabel: string;
  onRetry: () => void;
  note: string;
}) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 rounded-panel bg-surface p-6 text-center shadow-card sm:p-10">
      <span className="grid size-14 place-items-center rounded-full bg-fail-bg text-fail">
        <AlertTriangle className="size-7" strokeWidth={2} />
      </span>
      <h1 className="text-[24px] font-bold tracking-[-0.02em] text-ink sm:text-[28px]">
        {title}
      </h1>
      {message ? (
        <p className="max-w-[520px] text-[15px] leading-relaxed text-muted">
          {message}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={onRetry}>
          <RotateCw className="size-[18px]" strokeWidth={2.2} />
          {actionLabel}
        </Button>
        <Link
          href="/exams"
          className="rounded-full px-4 py-2 text-[15px] text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          Upload different files
        </Link>
      </div>
      <p className="max-w-[440px] text-[13px] leading-relaxed text-faint">
        {note}
      </p>
    </section>
  );
}

/**
 * The narrow-screen fallback: two panes become one, with a switch.
 *
 * Both panels stay mounted and the hidden one is only `display: none`, so the
 * viewer keeps its scroll position and zoom, and the box the highlight scrolls
 * to already exists in the DOM by the time the pane becomes visible.
 */
function PaneSwitch({
  pane,
  onChange,
  sheetBadge,
}: {
  pane: "questions" | "sheet";
  onChange: (pane: "questions" | "sheet") => void;
  sheetBadge: number;
}) {
  const tabs = [
    { id: "questions" as const, label: "Questions", icon: FileText },
    { id: "sheet" as const, label: "Answer Sheet", icon: ImageIcon },
  ];

  return (
    <div
      role="tablist"
      aria-label="Review panes"
      className="flex shrink-0 gap-1 rounded-full bg-surface p-1 shadow-card"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={pane === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full px-3 py-2 text-[14px] font-medium whitespace-nowrap transition-colors sm:px-4",
            pane === tab.id
              ? "bg-ink text-white"
              : "text-muted hover:bg-subtle hover:text-ink",
          )}
        >
          <tab.icon className="size-[16px]" strokeWidth={2} />
          {tab.label}
          {tab.id === "sheet" && sheetBadge > 0 ? (
            <span className="rounded-full bg-highlight px-1.5 text-[11px] font-semibold text-white tabular-nums">
              {sheetBadge}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
