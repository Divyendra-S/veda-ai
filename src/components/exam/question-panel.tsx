"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, Inbox } from "lucide-react";
import { cn } from "@/lib/cn";
import { QuestionRow } from "@/components/exam/question-row";
import type {
  PlacedRegion,
  ReviewModel,
  Target,
} from "@/lib/exam/review-model";
import { formatMarks } from "@/lib/exam/review-model";
import type { AnswerRecord, ExamSummary } from "@/lib/exam/types";

/**
 * The left panel: the register in printed order, the whole-paper result above
 * it, and the blocks that matched nothing beneath it.
 *
 * Expansion lives here and selection lives above, because the two have
 * different reach — Expand All is a control on this panel, while a selection
 * has to travel to the viewer. Selecting also expands, so one click on a row
 * shows the mark, the transcript and the highlight together.
 */
export function QuestionPanel({
  model,
  summary,
  selectedKey,
  onSelect,
  className,
}: {
  model: ReviewModel;
  summary: ExamSummary | null;
  selectedKey: string | null;
  onSelect: (target: Target, region: PlacedRegion | null) => void;
  className?: string;
}) {
  // Only questions expand; an unplaceable block has nothing hidden to reveal.
  const keys = model.rows.map((row) => row.target.key);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const allExpanded = keys.length > 0 && keys.every((key) => expanded.has(key));
  const list = useRef<HTMLDivElement>(null);

  const nothingMatched =
    model.unmatched.length === 0 &&
    model.rows.length > 0 &&
    model.rows.every((row) => row.target.regions.length === 0);

  /**
   * Arrow keys walk the register.
   *
   * Every row stays in the tab order rather than becoming a roving-tabindex
   * listbox: the rows are buttons and each carries a second button beside it,
   * which a listbox cannot contain. So this is an accelerator over the native
   * behaviour, not a replacement for it — Tab still reaches everything, and
   * Enter on a row still selects it.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowUp"
          ? -1
          : event.key === "Home"
            ? -Infinity
            : event.key === "End"
              ? Infinity
              : 0;
    if (!step || !list.current) return;

    const rows = Array.from(
      list.current.querySelectorAll<HTMLButtonElement>("[data-row]"),
    );
    if (rows.length === 0) return;

    const here = rows.findIndex((row) => row.contains(document.activeElement));
    const next =
      step === -Infinity
        ? 0
        : step === Infinity
          ? rows.length - 1
          : Math.min(rows.length - 1, Math.max(0, (here < 0 ? 0 : here) + step));

    event.preventDefault();
    rows[next].focus();
  };

  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const select = (target: Target) => {
    setExpanded((current) => new Set(current).add(target.key));
    onSelect(target, target.regions[0] ?? null);
  };

  return (
    <section
      className={cn(
        "flex min-w-0 flex-1 flex-col rounded-panel bg-panel shadow-card",
        className,
      )}
    >
      {/* 8px of side padding on a phone, against 16 from `sm` up. Both are the
          design's: the phone frame runs its cards to 8px of the panel edge, and
          on a 393px screen those two columns are the difference between a
          question reading three words to a line and four. */}
      <header className="shrink-0 px-2 pt-4 pb-3 sm:px-4">
        <div className="flex items-center gap-3">
          {/* Centred while `Expand All` is away, which is how the phone frame
              draws it, and one weight throughout — the parenthetical is set in
              the same bold ink as the rest in both frames, not dropped to a
              muted aside. It stays on a phone because it is the sentence that
              says the list is the paper's questions and not the student's
              headings, which is exactly the thing a small screen gives you
              least context to work out. */}
          <h1 className="min-w-0 flex-1 text-center text-[16px] font-semibold text-ink sm:text-left">
            Extracted Questions (from question paper)
          </h1>
          <button
            type="button"
            onClick={() =>
              setExpanded(allExpanded ? new Set() : new Set(keys))
            }
            // Absent from the phone frame, and it has to be: the full title
            // takes the width there on its own, and a button beside it wraps
            // the heading onto two lines. Every row still has its chevron, and
            // opening all fourteen on a phone is a scroll rather than an
            // overview anyway.
            className="hidden shrink-0 cursor-pointer rounded-[14px] bg-surface px-4 py-2 text-[14px] font-medium text-ink shadow-card transition-colors hover:bg-subtle sm:block"
          >
            {allExpanded ? "Collapse All" : "Expand All"}
          </button>
        </div>

        {summary ? <SummaryStrip summary={summary} /> : null}
      </header>

      <div
        ref={list}
        onKeyDown={onKeyDown}
        className="scrollbar-slim flex-1 overflow-y-auto px-2 pb-4 sm:px-4"
      >
        {summary ? <OverallFeedback summary={summary} /> : null}

        {nothingMatched ? (
          <p className="mb-3 flex items-start gap-2.5 rounded-card bg-surface px-3.5 py-3 text-[13px] leading-relaxed text-muted shadow-card">
            <Inbox className="mt-0.5 size-4 shrink-0 text-faint" strokeWidth={2} />
            <span>
              Nothing on the answer sheet was matched to this paper. Every
              question below is recorded as not attempted — which is what a
              blank or unreadable sheet looks like from here.
            </span>
          </p>
        ) : null}

        <ol className="flex flex-col gap-3">
          {model.rows.map((row) => (
            <QuestionRow
              key={row.target.key}
              row={row}
              selected={selectedKey === row.target.key}
              expanded={expanded.has(row.target.key)}
              onSelect={() => select(row.target)}
              onToggle={() => toggle(row.target.key)}
              onFocusRegion={(region) => onSelect(row.target, region)}
            />
          ))}
        </ol>

        {model.unmatched.length > 0 ? (
          <section className="mt-5">
            <h2 className="px-1 pb-2 text-[14px] font-semibold text-ink">
              Answered, but not on this paper{" "}
              <span className="font-normal text-muted">
                — {model.unmatched.length}{" "}
                {model.unmatched.length === 1 ? "block" : "blocks"} matched no
                question
              </span>
            </h2>
            <ol className="flex flex-col gap-3">
              {model.unmatched.map(({ target, answer }) => (
                <UnmatchedRow
                  key={target.key}
                  target={target}
                  answer={answer}
                  selected={selectedKey === target.key}
                  onSelect={() => select(target)}
                />
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </section>
  );
}

/** The result, as arithmetic over the marks below it rather than as a figure
 *  the model was asked for. Every number here is computed server-side. */
function SummaryStrip({ summary }: { summary: ExamSummary }) {
  const tone =
    summary.percentage >= 80
      ? "bg-pass-bg text-pass"
      : summary.percentage > 0
        ? "bg-warn-bg text-warn"
        : "bg-fail-bg text-fail";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[14px] bg-surface px-4 py-3 shadow-card">
      <span className="text-[24px] leading-none font-bold tracking-[-0.02em] text-ink tabular-nums">
        {formatMarks(summary.awardedMarks)}
        <span className="text-[16px] text-muted">
          /{formatMarks(summary.totalMarks)}
        </span>
      </span>
      <span
        className={cn(
          "rounded-full px-2.5 py-1 text-[13px] font-semibold tabular-nums",
          tone,
        )}
      >
        {summary.percentage}%
      </span>
      <span className="ml-auto text-[13px] text-muted tabular-nums">
        {summary.answered} answered · {summary.unanswered} skipped ·{" "}
        {summary.unmatched} unplaceable
      </span>
    </div>
  );
}

/**
 * The whole-paper comment, closed until asked for.
 *
 * It is several paragraphs of prose and the questions are what this screen is
 * for, so it opens as a single line and gets out of the way. The numbers a
 * teacher actually scans for are already in the strip above it.
 */
function OverallFeedback({ summary }: { summary: ExamSummary }) {
  const [open, setOpen] = useState(false);
  const lists = [
    { term: "Strengths", items: summary.strengths, tone: "text-pass" },
    { term: "To work on", items: summary.gaps, tone: "text-warn" },
  ].filter((list) => list.items.length > 0);

  return (
    <div className="mb-3 rounded-card bg-surface shadow-card">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 p-3.5 text-left"
      >
        <span className="shrink-0 text-[13px] font-semibold text-ink">
          Overall Feedback
        </span>
        {open ? null : (
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
            {summary.overallFeedback}
          </span>
        )}
        <ChevronDown
          className={cn(
            "ml-auto size-[18px] shrink-0 text-muted transition-transform duration-200",
            open && "rotate-180",
          )}
          strokeWidth={2}
        />
      </button>

      {open ? (
        <div className="px-3.5 pb-3.5">
          <p className="text-[13px] leading-relaxed text-ink-soft">
            {summary.overallFeedback}
          </p>
          {lists.length > 0 ? (
            <dl className="mt-2.5 grid gap-2 sm:grid-cols-2">
              {lists.map((list) => (
                <div
                  key={list.term}
                  className="rounded-[12px] bg-inset px-3 py-2.5"
                >
                  <dt className={cn("text-[12px] font-semibold", list.tone)}>
                    {list.term}
                  </dt>
                  <dd>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] leading-relaxed text-muted">
                      {list.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A block of handwriting that answers nothing on this paper. It gets a row of
 * its own, and it highlights exactly like a question does, because "the model
 * read something here and could not place it" is a claim a teacher has to be
 * able to check against the page.
 */
function UnmatchedRow({
  target,
  answer,
  selected,
  onSelect,
}: {
  target: Target;
  answer: AnswerRecord;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li
      className={cn(
        "rounded-card border-2 bg-surface shadow-card transition-colors",
        selected ? "border-brand-soft" : "border-transparent",
      )}
    >
      <button
        type="button"
        data-row
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Unplaceable answer ${target.tag}`}
        className="flex w-full cursor-pointer items-center gap-3 rounded-card p-3 text-left outline-offset-2 focus-visible:outline-2 focus-visible:outline-brand"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-warn-bg text-[12px] font-semibold text-warn">
          {target.tag.slice(0, 4)}
        </span>
        <span className="min-w-0 flex-1 text-[14px] leading-[1.55] text-ink-soft">
          {answer.transcript}
        </span>
        <span className="shrink-0 rounded-full bg-inset px-2.5 py-1 text-[12px] font-medium text-muted tabular-nums">
          {target.regions.length === 1
            ? `page ${target.regions[0].pageIndex + 1}`
            : `${target.regions.length} regions`}
        </span>
      </button>
    </li>
  );
}
