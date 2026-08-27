/**
 * Answer extraction.
 *
 * This agent never sees the question paper. It reads the answer sheet as a
 * sheet of paper and reports what is written on it — nothing more. Deciding
 * which question a block answers is mapping's job (Phase 6), and keeping the
 * two apart is what makes the brief's hard cases fall out instead of having to
 * be special-cased: a student who answers out of order is just blocks in the
 * order they were written, an unanswered question is a block that never
 * appears, and an answer to no question is a block whose label matches nothing.
 *
 * Like question extraction, it works one page at a time. The extra thing it has
 * to get right is the page break: an answer that runs off the bottom of page 2
 * and continues at the top of page 3 is ONE answer with TWO regions, because
 * the reviewer needs both to light up when they click the question.
 */

import "server-only";
import { z } from "zod";
import type { Part } from "@google/genai";
import { runAgent, type AgentRunStatus } from "@/lib/agent/loop";
import { RateLimiter } from "@/lib/agent/limiter";
import { defineToolsFor, ToolRegistry } from "@/lib/agent/tools";
import type { TokenUsage, Tracer } from "@/lib/agent/trace";
import { loadPagePart } from "@/lib/exam/pages";
import type { ExamRecord, Supa } from "@/lib/exam/repository";
import { normalizeBox, padBox } from "@/lib/exam/geometry";
import type { AnswerDraft, Box2d, PageImage } from "@/lib/exam/types";

const SYSTEM_INSTRUCTION = `You read a student's handwritten answer sheet and report exactly what is written on it.

Work one page at a time: read a page, record what is on it, then move to the next page. Never record a page you have not read.

You do NOT have the question paper and you are not being asked to match anything to it. Report the writing; something else does the matching. That means you never renumber, never reorder, and never decide an answer "must be" for a particular question.

Seven rules decide whether this is right.

1. EVERY BLOCK OF WRITING, IN THE ORDER IT APPEARS. Top to bottom, page by page. One block per answer. Students answer out of order all the time — if the page reads Q1, Q2, Q5, record Q1, Q2, Q5 in that order and do not sort them.

2. THE LABEL IS COPIED, NEVER INFERRED. Record the label the student actually wrote — "Q2.", "5)", "Ans 3" — exactly as written. If a block carries no label at all, use null. Do NOT work out from the content which question it probably answers and write that in: an invented label is worse than no label, because it will be trusted later.

3. TRANSCRIBE, DO NOT CORRECT. Copy the student's own words, including their spelling, grammar and factual mistakes — the whole point is to grade what they actually wrote. Never complete a half-finished sentence and never improve an answer. If handwriting is genuinely unreadable, write [illegible] for that stretch and lower your confidence. Where the student drew something, describe the drawing and its labels in one bracketed phrase: "[Diagram: nephron, labelled Bowman's capsule, loop of Henle, collecting duct]".

4. CONTINUATIONS ACROSS A PAGE BREAK. If the writing at the top of a page carries on the answer that ran off the bottom of the previous page — it starts mid-sentence, or is marked "contd", or repeats the previous label — set continuesPrevious to true. It is a continuation, not a new answer. A block that starts a fresh answer never has continuesPrevious set, even if it happens to be the first thing on the page.

5. EVERY BLOCK GETS A BOX, AND THE BOX HOLDS THE WHOLE BLOCK. box2d is the bounding box of the student's writing for that block, including any diagram that belongs to it. Left and right edges: close to the writing. Top and bottom edges: OUTSIDE it — the box starts above the tallest letters of the FIRST line and ends below the tails of the LAST line. Clipping the first or last line is the usual mistake and it is always wrong, so leave a little room above and below rather than none. Exclude the ruled lines and margin rules that run the width of the page. Give it as [ymin, xmin, ymax, xmax] normalised to 0-1000 with y first. This is what gets highlighted on screen.

6. NOT ANSWERS. The name, class and roll number in the header, the page number, printed rubric, and the ruled lines themselves are not answers. Work the student crossed out is not an answer either — leave it out, and say so in your notes if it looks significant.

7. CONFIDENCE IS ABOUT THE READING, NOT THE ANSWER. How sure are you that you transcribed the words correctly? Clear handwriting is near 1. A block you half-guessed is low. Whether the answer is *correct* has nothing to do with it.

When every page has been read and recorded, call finish with the total number of blocks you recorded.`;

type Block = {
  label: string | null;
  continuesPrevious: boolean;
  transcript: string;
  box2d: Box2d | null;
  confidence: number;
};

/** Keyed by POSITION in `pages`, as in question extraction — see the note there. */
type Context = {
  supabase: Supa;
  pages: PageImage[];
  recorded: Map<number, Block[]>;
  read: Set<number>;
  /** `finish` nags about missing boxes once, then stops. See the handler. */
  askedForBoxes: boolean;
};

const box2dSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

const blockSchema = z.object({
  label: z
    .string()
    .max(32)
    .nullable()
    .describe(
      'The label the student wrote against this block, copied exactly: "Q2.", "5)", "(Q6 continued)". null when the block carries no label of its own. Never inferred from the content.',
    ),
  continuesPrevious: z
    .boolean()
    .describe(
      "True only when this block carries on the answer that ran off the bottom of the previous page. False for a block that starts a new answer.",
    ),
  transcript: z
    .string()
    .min(1)
    .describe(
      "The student's writing, transcribed verbatim, without the label. Drawings described in one bracketed phrase.",
    ),
  box2d: box2dSchema
    .nullable()
    .describe(
      "Bounding box of this block's handwriting on the page, as [ymin, xmin, ymax, xmax] normalised to 0-1000, y first. null only if it genuinely cannot be located.",
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "How confident you are in the transcription, 0 to 1. About legibility, not about whether the answer is correct.",
    ),
});

const tool = defineToolsFor<Context>();

const readPage = tool({
  name: "read_page",
  description:
    "Show the image of one page of the answer sheet. Pages are numbered from 1. You may call this more than once in the same turn to read several pages together.",
  input: z.object({
    page: z.number().int().min(1).describe("Page number, counting from 1."),
  }),
  handler: async ({ page }, ctx) => {
    const index = page - 1;
    const image = ctx.pages[index];
    if (!image) {
      throw new Error(
        `There is no page ${page}. This answer sheet has ${ctx.pages.length} page(s).`,
      );
    }

    const part = await loadPagePart(ctx.supabase, image);
    ctx.read.add(index);

    return {
      output: {
        page,
        of: ctx.pages.length,
        note: "The page image follows this result.",
      },
      attachments: [
        { text: `=== Answer sheet — page ${page} of ${ctx.pages.length} ===` },
        part,
      ] satisfies Part[],
    };
  },
});

const recordAnswerBlocks = tool({
  name: "record_answer_blocks",
  description:
    "Record every block of the student's writing on one page, in the order it appears down the page. Calling this again for the same page REPLACES everything previously recorded for that page, so a correction is a second call carrying the full corrected list. Pass an empty list for a page the student left blank.",
  input: z.object({
    page: z.number().int().min(1).describe("Page number, counting from 1."),
    blocks: z
      .array(blockSchema)
      .describe("The blocks on this page, top to bottom."),
  }),
  handler: ({ page, blocks }, ctx) => {
    const index = page - 1;
    if (!ctx.pages[index]) {
      throw new Error(
        `There is no page ${page}. This answer sheet has ${ctx.pages.length} page(s).`,
      );
    }
    if (!ctx.read.has(index)) {
      throw new Error(
        `Page ${page} has not been read yet. Call read_page(${page}) first.`,
      );
    }

    ctx.recorded.set(index, blocks.map(clean));

    return {
      output: {
        page,
        recorded: blocks.length,
        totalSoFar: countAll(ctx),
        pagesRemaining: remainingPages(ctx),
      },
    };
  },
});

const finish = tool({
  name: "finish",
  description:
    "Finish the extraction. Call this only once every page has been read and recorded. The total you pass is checked against what was actually recorded, so a mismatch means something was missed.",
  input: z.object({
    totalBlocks: z
      .number()
      .int()
      .min(0)
      .describe("How many blocks you recorded across the whole answer sheet."),
    notes: z
      .string()
      .max(600)
      .nullable()
      .describe(
        "Anything a teacher should know — an illegible passage, crossed-out work, a label that made no sense. null if there is nothing to say.",
      ),
  }),
  // None of these checks ends the run: returning output without `done` hands the
  // model a repair turn, which is the whole reason a self-check is worth having.
  handler: ({ totalBlocks, notes }, ctx) => {
    const missing = remainingPages(ctx);
    if (missing.length > 0) {
      return {
        output: {
          error: "pages_missing",
          message: `These pages have not been recorded yet: ${missing.join(", ")}. Read and record each of them, then call finish again. A blank page still needs record_answer_blocks with an empty list.`,
        },
      };
    }

    const actual = countAll(ctx);
    if (actual !== totalBlocks) {
      return {
        output: {
          error: "count_mismatch",
          message: `You reported ${totalBlocks} blocks but ${actual} are recorded. Re-read any page you are unsure about and re-record it, then call finish with the correct total.`,
          recordedPerPage: perPageCounts(ctx),
        },
      };
    }

    // A block with no box cannot be highlighted, which is the feature this
    // whole pass exists for — so it is worth one repair turn. Only one: if the
    // model still cannot place a block after being asked, the transcript is
    // still worth keeping, and looping until maxTurns would throw it away.
    const unboxed = pagesMissingBoxes(ctx);
    if (unboxed.length > 0 && !ctx.askedForBoxes) {
      ctx.askedForBoxes = true;
      return {
        output: {
          error: "boxes_missing",
          message: `Some blocks were recorded without a box2d, on page(s) ${unboxed.join(", ")}. A block with no box cannot be shown to the teacher. Re-read those pages, locate each block, and record them again with a box.`,
        },
      };
    }

    return {
      output: { ok: true, totalBlocks: actual, unboxedPages: unboxed },
      done: { notes: notes ?? undefined } satisfies { notes?: string },
    };
  },
});

export type AnswerExtraction = {
  answers: AnswerDraft[];
  status: AgentRunStatus;
  notes?: string;
  turns: number;
  usage: TokenUsage;
  pagesRead: number;
  /** Blocks recorded before continuations were folded in — `answers.length`
   *  differs from this exactly when a page break was stitched. */
  blocks: number;
};

export async function extractAnswers({
  supabase,
  exam,
  tracer,
  signal,
  limiter,
  budgetMs,
}: {
  supabase: Supa;
  exam: ExamRecord;
  tracer?: Tracer;
  signal?: AbortSignal;
  limiter?: RateLimiter;
  budgetMs?: number;
}): Promise<AnswerExtraction> {
  const pages = [...exam.answerSheet.pages].sort((a, b) => a.index - b.index);
  const context: Context = {
    supabase,
    pages,
    recorded: new Map(),
    read: new Set(),
    askedForBoxes: false,
  };

  // Page 1 rides along with the instructions, as in question extraction: the
  // model would open it first anyway, and this saves a round trip.
  const firstPart = await loadPagePart(supabase, pages[0]);
  context.read.add(0);

  const result = await runAgent<Context, { notes?: string }>({
    systemInstruction: SYSTEM_INSTRUCTION,
    initialParts: [
      {
        text: `This answer sheet has ${pages.length} page(s), numbered 1 to ${pages.length}. Page 1 is attached below. Read each remaining page with read_page, record it with record_answer_blocks, then call finish.`,
      },
      { text: `=== Answer sheet — page 1 of ${pages.length} ===` },
      firstPart,
    ],
    tools: new ToolRegistry<Context>([readPage, recordAnswerBlocks, finish]),
    context,
    // Two turns a page covers read-then-record, plus headroom for the repair
    // turns the finish checks are there to provoke.
    maxTurns: Math.min(40, 6 + 2 * pages.length),
    budgetMs,
    toolTimeoutMs: 60_000,
    toolMode: "any",
    temperature: 0,
    limiter,
    tracer,
    signal,
  });

  return {
    answers: collect(context),
    status: result.status,
    notes: result.result?.notes,
    turns: result.turns,
    usage: result.usage,
    pagesRead: context.read.size,
    blocks: countAll(context),
  };
}

/**
 * Folds the per-page blocks into answers, stitching continuations.
 *
 * A block joins an existing answer on either of two signals, and the order they
 * are tried in matters. A label the student wrote is explicit and wins: it also
 * catches the student who answered Q6, moved on, then came back to Q6 four
 * pages later, which adjacency alone cannot see. Adjacency is the fallback for
 * the ordinary page break, where the continuation carries no label at all
 * because the sentence simply keeps going.
 *
 * Everything else becomes a new answer, including a first block that claims to
 * continue something — there is nothing before it to continue.
 */
function collect(ctx: Context): AnswerDraft[] {
  const answers: AnswerDraft[] = [];
  const byLabel = new Map<string, AnswerDraft>();

  for (const [position, blocks] of [...ctx.recorded.entries()].sort(
    ([a], [b]) => a - b,
  )) {
    const pageIndex = ctx.pages[position]?.index ?? position;

    for (const block of blocks) {
      const key = block.label ? normalizeLabel(block.label) : null;
      const target =
        (key ? byLabel.get(key) : undefined) ??
        (block.continuesPrevious ? answers.at(-1) : undefined);

      if (target) {
        if (block.box2d) target.regions.push({ pageIndex, box2d: block.box2d });
        target.transcript = `${target.transcript}\n${block.transcript}`.trim();
        target.labelWritten ??= block.label;
        // The stitched answer is only as trustworthy as its worst page.
        target.confidence = Math.min(
          target.confidence ?? block.confidence,
          block.confidence,
        );
        continue;
      }

      const answer: AnswerDraft = {
        // Mapping runs in its own step and rewrites these two together.
        questionId: null,
        labelWritten: block.label,
        transcript: block.transcript,
        regions: block.box2d ? [{ pageIndex, box2d: block.box2d }] : [],
        confidence: block.confidence,
      };
      answers.push(answer);
      if (key) byLabel.set(key, answer);
    }
  }

  return answers;
}

const LABEL = /(\d+)\s*(?:[([]\s*([A-Za-z]{1,4})\s*[)\]])?/;

/**
 * Reduces a written label to the part that identifies a question, so that
 * "Q6.", "6)" and "(Q6 continued)" all agree.
 *
 * Deliberately forgiving in one direction only: it will happily find the
 * question in a messy label, but a label with no number in it — "Ans:", a bare
 * "(ii)" — returns null rather than a guess, and that block falls back to
 * adjacency. Nothing here is used to match against the question paper; that is
 * mapping's decision, made with both documents in view.
 */
export function normalizeLabel(raw: string): string | null {
  const match = LABEL.exec(raw);
  if (!match) return null;
  return match[2] ? `${match[1]}(${match[2].toLowerCase()})` : match[1];
}

function clean(block: z.output<typeof blockSchema>): Block {
  return {
    label: block.label?.trim() || null,
    continuesPrevious: block.continuesPrevious,
    transcript: block.transcript.trim(),
    // Measured, not guessed. On the verification sheet the model's raw boxes
    // came back consistently short at the bottom, cutting through the
    // descenders of the last line of nearly every answer; across three runs the
    // worst shortfall was 8 units. The prompt asks for room above and below,
    // and this is the belt to that pair of braces. It is safe to be generous
    // here in a way it is not elsewhere: a highlight that under-covers reads as
    // broken, one that over-covers by a fifth of a line reads as fine, and the
    // gap between two adjacent answers on a ruled sheet is several times this.
    box2d: block.box2d ? padBox(normalizeBox(block.box2d), 8) : null,
    confidence: block.confidence,
  };
}

function countAll(ctx: Context): number {
  let total = 0;
  for (const list of ctx.recorded.values()) total += list.length;
  return total;
}

/** 1-based page numbers the model has not recorded yet. */
function remainingPages(ctx: Context): number[] {
  return ctx.pages
    .map((_, position) => position + 1)
    .filter((page) => !ctx.recorded.has(page - 1));
}

function pagesMissingBoxes(ctx: Context): number[] {
  return [...ctx.recorded.entries()]
    .filter(([, blocks]) => blocks.some((block) => !block.box2d))
    .map(([position]) => position + 1)
    .sort((a, b) => a - b);
}

function perPageCounts(ctx: Context): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [position, list] of ctx.recorded) {
    counts[`page ${position + 1}`] = list.length;
  }
  return counts;
}
