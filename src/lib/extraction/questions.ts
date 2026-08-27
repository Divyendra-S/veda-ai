/**
 * Question extraction.
 *
 * The brief grades this pass on four things, and every rule in the prompt and
 * every check in `finish` exists to serve one of them: every question, in
 * printed order; labelled sub-parts as separate entries; numbering preserved
 * verbatim; marks captured where printed.
 *
 * The agent reads one page at a time rather than being handed the whole paper
 * at once. That costs round trips, but it keeps each recording decision
 * anchored to a single image — which is what makes "in printed order" and the
 * per-question page attribution fall out for free instead of being inferred.
 */

import "server-only";
import { z } from "zod";
import type { Part } from "@google/genai";
import { runAgent, type AgentRunStatus } from "@/lib/agent/loop";
import { RateLimiter } from "@/lib/agent/limiter";
import { defineToolsFor, ToolRegistry } from "@/lib/agent/tools";
import type { Tracer } from "@/lib/agent/trace";
import type { TokenUsage } from "@/lib/agent/trace";
import { loadPagePart } from "@/lib/exam/pages";
import type { ExamRecord, QuestionDraft, Supa } from "@/lib/exam/repository";
import { normalizeBox } from "@/lib/exam/geometry";
import type { Box2d, PageImage } from "@/lib/exam/types";

const SYSTEM_INSTRUCTION = `You read printed exam papers and produce a faithful register of every question on them.

Work one page at a time: read a page, record what is on it, then move to the next page. Never record a page you have not read.

Six rules decide whether the register is right.

1. EVERY QUESTION, IN PRINTED ORDER. Top to bottom, page by page. Nothing skipped, nothing invented, nothing reordered.

2. LABELLED SUB-PARTS ARE SEPARATE ENTRIES. If question 11 is printed with parts (a) and (b), that is TWO entries — "11 (a)" and "11 (b)" — never one combined entry. Only a printed part label counts: (a), (ii), A. A bullet, a dash or a sentence beginning "Also" inside one question is not a sub-part. Text printed above the parts that applies to all of them (a shared passage, a figure, a table of data) belongs in every part it applies to, so each entry can be read on its own.

3. NUMBERING IS COPIED, NEVER NORMALISED. "Q.7" stays "Q.7". "11 (a)" stays "11 (a)". If a paper numbers its questions 1, 2, 2, 4 by mistake, record 1, 2, 2, 4. Never renumber to make a sequence tidy, and never invent a number for a question printed without one — use the label the page shows, or the position in the list if that is genuinely all there is.

4. MARKS COME FROM THE PAGE. Record the number printed against the question — "[5]", "(5 marks)", "5 M". If nothing is printed for that question, use null. Do not divide a section total between its questions, and do not guess from the length of the answer expected.

5. QUESTION TEXT IS TRANSCRIBED, NOT SUMMARISED. Copy the wording as printed. Leave out the number itself and the marks annotation, which are recorded in their own fields. Where a question depends on a figure, diagram or table, describe it in one short bracketed phrase so the question still makes sense on its own: "[Figure: two potted plants, A in bright light, B in dim light]".

6. ONLY QUESTIONS. The school name, the subject, the time allowed, the total marks, section headings and instructions such as "Answer all questions" are not questions.

7. EVERY ENTRY GETS A BOX. Give each entry the bounding box of the whole question as printed — its number, its text and its marks — as box2d in [ymin, xmin, ymax, xmax] normalised to 0-1000 with y first. Use null only when the question genuinely cannot be located on the page.

A question that begins on one page and continues on the next is ONE entry, recorded on the page where it begins.

When every page has been read and recorded, call finish with the total number of entries you recorded.`;

type Recorded = {
  number: string;
  parentNumber: string;
  partLabel: string | null;
  text: string;
  maxMarks: number | null;
  box2d: Box2d | null;
};

/**
 * `recorded` and `read` are keyed by POSITION in `pages`, not by the stored
 * `PageImage.index`. The two are the same today, and keeping one of them as the
 * only key used inside the run is what stops them quietly diverging if a
 * document ever arrives with a gap in its indices. `collect` converts back.
 */
type Context = {
  supabase: Supa;
  pages: PageImage[];
  recorded: Map<number, Recorded[]>;
  read: Set<number>;
};

const box2dSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);

const questionSchema = z.object({
  number: z
    .string()
    .min(1)
    .max(32)
    .describe(
      'The label exactly as printed, including the sub-part: "7", "Q.7", "11 (a)". Never renumbered, never invented.',
    ),
  parentNumber: z
    .string()
    .min(1)
    .max(32)
    .describe(
      'The whole-question part of the label: "11" for "11 (a)". Equal to `number` when the question has no sub-parts.',
    ),
  partLabel: z
    .string()
    .max(8)
    .nullable()
    .describe(
      'The sub-part on its own: "a" for "11 (a)", "ii" for "3 (ii)". null when the question has no sub-part.',
    ),
  text: z
    .string()
    .min(1)
    .describe(
      "The question text transcribed verbatim, without the number and without the marks annotation.",
    ),
  maxMarks: z
    .number()
    .min(0)
    .max(200)
    .nullable()
    .describe(
      "The marks printed against this question. null when no marks are printed for it.",
    ),
  box2d: box2dSchema
    .nullable()
    .describe(
      "Bounding box of this whole question on the page — number, text and marks — as [ymin, xmin, ymax, xmax] normalised to 0-1000, y first. null only if it cannot be located.",
    ),
});

const tool = defineToolsFor<Context>();

const readPage = tool({
  name: "read_page",
  description:
    "Show the image of one page of the question paper. Pages are numbered from 1. You may call this more than once in the same turn to read several pages together.",
  input: z.object({
    page: z
      .number()
      .int()
      .min(1)
      .describe("Page number, counting from 1."),
  }),
  handler: async ({ page }, ctx) => {
    const index = page - 1;
    const image = ctx.pages[index];
    if (!image) {
      throw new Error(
        `There is no page ${page}. This paper has ${ctx.pages.length} page(s).`,
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
        { text: `=== Question paper — page ${page} of ${ctx.pages.length} ===` },
        part,
      ] satisfies Part[],
    };
  },
});

const recordQuestions = tool({
  name: "record_questions",
  description:
    "Record every question printed on one page, in the order they appear down the page. Calling this again for the same page REPLACES everything previously recorded for that page, so a correction is a second call carrying the full corrected list. Pass an empty list for a page that has no questions on it, such as a cover or an instructions page.",
  input: z.object({
    page: z.number().int().min(1).describe("Page number, counting from 1."),
    questions: z
      .array(questionSchema)
      .describe("The questions on this page, in printed order."),
  }),
  handler: ({ page, questions }, ctx) => {
    const index = page - 1;
    if (!ctx.pages[index]) {
      throw new Error(
        `There is no page ${page}. This paper has ${ctx.pages.length} page(s).`,
      );
    }
    if (!ctx.read.has(index)) {
      throw new Error(
        `Page ${page} has not been read yet. Call read_page(${page}) first.`,
      );
    }

    ctx.recorded.set(index, questions.map(clean));

    return {
      output: {
        page,
        recorded: questions.length,
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
    totalQuestions: z
      .number()
      .int()
      .min(0)
      .describe("How many entries you recorded across the whole paper."),
    notes: z
      .string()
      .max(600)
      .nullable()
      .describe(
        "Anything a teacher should know about this paper — an unreadable region, a numbering oddity. null if there is nothing to say.",
      ),
  }),
  // Neither check ends the run: returning output without `done` hands the model
  // a repair turn, which is the whole reason a self-check is worth having.
  handler: ({ totalQuestions, notes }, ctx) => {
    const missing = remainingPages(ctx);
    if (missing.length > 0) {
      return {
        output: {
          error: "pages_missing",
          message: `These pages have not been recorded yet: ${missing.join(", ")}. Read and record each of them, then call finish again. A page with no questions on it still needs record_questions with an empty list.`,
        },
      };
    }

    const actual = countAll(ctx);
    if (actual !== totalQuestions) {
      return {
        output: {
          error: "count_mismatch",
          message: `You reported ${totalQuestions} entries but ${actual} are recorded. Re-read any page you are unsure about and re-record it, then call finish with the correct total.`,
          recordedPerPage: perPageCounts(ctx),
        },
      };
    }

    return {
      output: { ok: true, totalQuestions: actual },
      done: { notes: notes ?? undefined } satisfies { notes?: string },
    };
  },
});

export type QuestionExtraction = {
  questions: QuestionDraft[];
  status: AgentRunStatus;
  notes?: string;
  turns: number;
  usage: TokenUsage;
  pagesRead: number;
};

export async function extractQuestions({
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
}): Promise<QuestionExtraction> {
  const pages = [...exam.questionPaper.pages].sort((a, b) => a.index - b.index);
  const context: Context = {
    supabase,
    pages,
    recorded: new Map(),
    read: new Set(),
  };

  // Page 1 rides along with the instructions. The model would open it first in
  // any case, and priming it here saves a round trip off a ~10 RPM budget.
  const firstPart = await loadPagePart(supabase, pages[0]);
  context.read.add(0);

  const result = await runAgent<Context, { notes?: string }>({
    systemInstruction: SYSTEM_INSTRUCTION,
    initialParts: [
      {
        text: `This question paper has ${pages.length} page(s), numbered 1 to ${pages.length}. Page 1 is attached below. Read each remaining page with read_page, record it with record_questions, then call finish.`,
      },
      { text: `=== Question paper — page 1 of ${pages.length} ===` },
      firstPart,
    ],
    tools: new ToolRegistry<Context>([readPage, recordQuestions, finish]),
    context,
    // Two turns a page covers read-then-record, plus headroom for the repair
    // turns the finish checks are there to provoke.
    maxTurns: Math.min(40, 6 + 2 * pages.length),
    budgetMs,
    // A page download plus a multi-megabyte base64 encode is slower than a
    // typical tool call, and timing one out would cost the whole run.
    toolTimeoutMs: 60_000,
    toolMode: "any",
    temperature: 0,
    limiter,
    tracer,
    signal,
  });

  return {
    questions: collect(context),
    status: result.status,
    notes: result.result?.notes,
    turns: result.turns,
    usage: result.usage,
    pagesRead: context.read.size,
  };
}

/** Flattens the per-page registers into printed order. */
function collect(ctx: Context): QuestionDraft[] {
  return [...ctx.recorded.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([position, questions]) =>
      questions.map((question) => ({
        ...question,
        pageIndex: ctx.pages[position]?.index ?? position,
      })),
    );
}

const SUBPART = /^(.*\S)\s*[([]\s*([A-Za-z]{1,4})\s*[)\]]\s*$/;

/**
 * Trusts the transcription, repairs the bookkeeping.
 *
 * `number` is what the model actually read off the page, so it is authoritative;
 * `parentNumber` and `partLabel` are a decomposition of it, and a model that
 * transcribes "11 (a)" correctly will still occasionally hand back
 * parentNumber "11 (a)". Deriving them from the label when it clearly carries a
 * part keeps the round badge and the part column in the UI consistent without
 * touching what was read.
 */
function clean(question: z.output<typeof questionSchema>): Recorded {
  const number = question.number.trim();
  const match = SUBPART.exec(number);
  const partLabel = question.partLabel?.trim() || null;

  return {
    number,
    parentNumber: match ? match[1] : question.parentNumber.trim() || number,
    partLabel: match ? match[2] : partLabel,
    text: question.text.trim(),
    maxMarks: question.maxMarks,
    box2d: question.box2d ? normalizeBox(question.box2d) : null,
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

function perPageCounts(ctx: Context): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [position, list] of ctx.recorded) {
    counts[`page ${position + 1}`] = list.length;
  }
  return counts;
}
