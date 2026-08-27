/**
 * Answer mapping.
 *
 * The third agent, and the first one that sees no images at all. Question
 * extraction read the paper, answer extraction read the sheet; both wrote down
 * what was there without either of them looking at the other document. This
 * pass is where the two meet, and because both sides are already text it is a
 * text-to-text problem over two short lists — cheap, and small enough that the
 * whole paper fits in one context instead of being reasoned about a page at a
 * time.
 *
 * Keeping it separate is what makes the brief's three hard cases ordinary:
 *
 *   answered out of order  every block is in view at once, so position on the
 *                          page is never load-bearing
 *   unanswered             a question nothing claims, asserted by a tool call
 *                          rather than inferred from a gap
 *   matches no question    a block whose label names nothing on the paper, kept
 *                          and surfaced instead of forced onto a near neighbour
 *
 * Nothing here decides whether an answer is *right*. A wrong answer to question
 * 5 is still an answer to question 5, and conflating the two would let a
 * misgraded answer disappear from the question it belongs to.
 */

import "server-only";
import { z } from "zod";
import { runAgent, type AgentRunStatus } from "@/lib/agent/loop";
import { RateLimiter } from "@/lib/agent/limiter";
import { defineToolsFor, ToolRegistry } from "@/lib/agent/tools";
import type { TokenUsage, Tracer } from "@/lib/agent/trace";
import { normalizeLabel } from "@/lib/extraction/answers";
import type { AnswerRecord, QuestionRecord } from "@/lib/exam/types";

const SYSTEM_INSTRUCTION = `You match a student's handwritten answers to the questions on their question paper.

Both documents have already been read for you, so you are working from two lists of text: the questions in printed order, and the blocks of writing on the answer sheet in the order the student wrote them. There are no images and you do not need any.

Your only job is to decide WHICH QUESTION each block answers. You are not grading and you never judge whether an answer is right — a completely wrong answer to question 5 is still an answer to question 5.

Six rules.

1. THE STUDENT'S OWN LABEL DECIDES IT. If a block is labelled "Q5." and the paper has a question 5, that block answers question 5. Even if its content looks off-topic, and however far out of order the blocks run. Students answer questions in whatever order suits them, so where a block sits on the page tells you nothing about which question it belongs to.

2. A LABEL THAT NAMES NO QUESTION MEANS UNMATCHED. If the student wrote "Q14." and the paper's questions stop at 13, that block matches nothing: mark it unmatched. Do not reassign it to the nearest number, and do not attach it to whichever question its content resembles. The label is authoritative in this direction too, and the teacher needs to see a block that could not be placed rather than find it silently filed under the wrong question.

3. SUB-PARTS ARE SEPARATE QUESTIONS. "11 (a)" and "11 (b)" are two questions with their own marks, and a block answers one of them, not both. A block labelled only "11" goes to whichever part its content actually answers; if it genuinely answers both, map it to the first part and say so in your notes.

4. NO LABEL — MATCH ON CONTENT. An unlabelled block goes to the question it actually answers: a paragraph naming Bowman's capsule and the loop of Henle answers the nephron question. Match on what is specifically asked, not on the general subject — two questions can both be about photosynthesis while only one of them asks for the pigments. If nothing fits clearly, unmatched is the honest answer. A wrong mapping is worse than an admitted one, because it is invisible.

5. A QUESTION NOTHING ANSWERS IS UNANSWERED. Say so explicitly. Every question needs a decision, including the ones the student skipped: that is what shows the teacher the question was checked rather than overlooked.

6. ACCOUNT FOR EVERYTHING. Every block ends up mapped or unmatched, every question mapped or unanswered, and finish will refuse to end the run until that holds.

Refer to a question by the number printed on the paper, exactly as the list shows it — "7", "11 (a)". Refer to a block by its bracketed tag — "a3". Each tool takes a list, so do as many decisions per call as you are sure of.`;

type Decision = {
  questionId: string;
  questionNumber: string;
  basis: "label" | "content";
};

type Context = {
  questions: QuestionRecord[];
  answers: AnswerRecord[];
  /** The printed number, exactly as extracted, and again normalised. */
  byNumber: Map<string, QuestionRecord>;
  byNormalized: Map<string, QuestionRecord>;
  /** answer ref → the question it answers. */
  mapped: Map<string, Decision>;
  /** answer ref → why it matches nothing. */
  unmatched: Map<string, string>;
  /** question id. */
  unanswered: Set<string>;
};

const tool = defineToolsFor<Context>();

const answerRef = z
  .string()
  .regex(/^a\d+$/i, 'An answer block tag, like "a3".')
  .describe('The bracketed tag of a block on the answer sheet, e.g. "a3".');

const questionNumber = z
  .string()
  .min(1)
  .max(24)
  .describe(
    'The number printed on the question paper, exactly as the list shows it: "7", "11 (a)".',
  );

const mapAnswersTool = tool({
  name: "map_answers",
  description:
    "Record that each of these blocks answers the question given. Mapping a block again moves it, so a correction is simply another call.",
  input: z.object({
    mappings: z
      .array(
        z.object({
          answer: answerRef,
          question: questionNumber,
          basis: z
            .enum(["label", "content"])
            .describe(
              'How you decided: "label" if the student wrote a label naming this question, "content" if you matched on what the answer says.',
            ),
        }),
      )
      .min(1),
  }),
  handler: ({ mappings }, ctx) => {
    const applied: string[] = [];

    for (const entry of mappings) {
      const answer = resolveAnswer(entry.answer, ctx);
      const question = resolveQuestion(entry.question, ctx);

      // Mapping is the positive act, so it always wins: it clears an earlier
      // "matches nothing" on this block and an earlier "nobody answered this"
      // on the question. The negative marks are the ones that refuse to
      // overwrite, which keeps the model from talking itself out of a match.
      ctx.unmatched.delete(answer.ref);
      ctx.unanswered.delete(question.id);
      ctx.mapped.set(answer.ref, {
        questionId: question.id,
        questionNumber: question.number,
        basis: entry.basis,
      });

      // Echoed back with both labels spelled out. If a tag slipped by one, the
      // model sees "a4 (labelled "Q6.") answers question 5" and can fix it on
      // the next turn instead of the mistake surfacing as a wrong highlight.
      applied.push(
        `${answer.ref} (labelled ${quote(answer.record.labelWritten)}) answers question "${question.number}" — by ${entry.basis}`,
      );
    }

    return { output: { applied, ...outstanding(ctx) } };
  },
});

const markUnmatched = tool({
  name: "mark_unmatched",
  description:
    "Record that these blocks answer none of the questions on this paper. Use it for a block whose label names a question the paper does not have, and for one whose content matches nothing clearly enough to place.",
  input: z.object({
    blocks: z
      .array(
        z.object({
          answer: answerRef,
          reason: z
            .string()
            .max(200)
            .describe(
              'Why it matches nothing, in a few words: "labelled Q14 but the paper ends at 13".',
            ),
        }),
      )
      .min(1),
  }),
  handler: ({ blocks }, ctx) => {
    for (const entry of blocks) {
      const answer = resolveAnswer(entry.answer, ctx);
      // Allowed even if the block was mapped a moment ago: this is the model
      // taking a mapping back, and refusing it would leave no way to undo one.
      ctx.mapped.delete(answer.ref);
      ctx.unmatched.set(answer.ref, entry.reason);
    }

    return {
      output: { unmatched: [...ctx.unmatched.keys()], ...outstanding(ctx) },
    };
  },
});

const markUnanswered = tool({
  name: "mark_unanswered",
  description:
    "Record that the student did not answer these questions. Every question the student skipped needs one of these.",
  input: z.object({
    questions: z
      .array(questionNumber)
      .min(1)
      .describe("The numbers of the questions nothing on the sheet answers."),
  }),
  handler: ({ questions }, ctx) => {
    for (const number of questions) {
      const question = resolveQuestion(number, ctx);

      // A genuine contradiction rather than a self-correction: some *other*
      // block claims this question. Refusing makes the model resolve which of
      // the two statements it meant, instead of leaving the pair disagreeing.
      const claimant = [...ctx.mapped.entries()].find(
        ([, decision]) => decision.questionId === question.id,
      );
      if (claimant) {
        throw new Error(
          `Question "${question.number}" cannot be unanswered: ${claimant[0]} is mapped to it. If that mapping is wrong, map ${claimant[0]} elsewhere or mark it unmatched first.`,
        );
      }

      ctx.unanswered.add(question.id);
    }

    return {
      output: { unansweredCount: ctx.unanswered.size, ...outstanding(ctx) },
    };
  },
});

const finish = tool({
  name: "finish",
  description:
    "Finish mapping. Every block must be mapped or unmatched and every question mapped or unanswered; this refuses until that is true.",
  input: z.object({
    notes: z
      .string()
      .max(600)
      .nullable()
      .describe(
        "Anything a teacher should know about the matching — a block that was hard to place, a label that made no sense. null if there is nothing to say.",
      ),
  }),
  handler: ({ notes }, ctx) => {
    const pending = outstanding(ctx);
    if (
      pending.blocksStillToDecide.length > 0 ||
      pending.questionsStillToDecide.length > 0
    ) {
      return {
        output: {
          error: "not_accounted_for",
          message:
            "Some items have had no decision yet. Map each remaining block or mark it unmatched, mark each remaining question unanswered, then call finish again.",
          ...pending,
        },
      };
    }

    return {
      output: { ok: true, ...summarise(ctx) },
      done: { notes: notes ?? undefined } satisfies { notes?: string },
    };
  },
});

export type AnswerMapping = {
  /** Every answer, including the ones that matched nothing — see below. */
  pairs: { answerId: string; questionId: string | null }[];
  mapped: number;
  unmatched: number;
  unanswered: number;
  status: AgentRunStatus;
  notes?: string;
  turns: number;
  usage: TokenUsage;
};

export async function mapAnswers({
  questions,
  answers,
  tracer,
  signal,
  limiter,
  budgetMs,
}: {
  questions: QuestionRecord[];
  answers: AnswerRecord[];
  tracer?: Tracer;
  signal?: AbortSignal;
  limiter?: RateLimiter;
  budgetMs?: number;
}): Promise<AnswerMapping> {
  const context: Context = {
    questions,
    answers,
    byNumber: new Map(questions.map((q) => [q.number.trim(), q])),
    byNormalized: index(questions),
    mapped: new Map(),
    unmatched: new Map(),
    unanswered: new Set(),
  };

  const result = await runAgent<Context, { notes?: string }>({
    systemInstruction: SYSTEM_INSTRUCTION,
    initialParts: [{ text: brief(questions, answers) }],
    tools: new ToolRegistry<Context>([
      mapAnswersTool,
      markUnmatched,
      markUnanswered,
      finish,
    ]),
    context,
    // The batch tools mean a confident run is three or four turns; the rest is
    // room for the repair turns finish is there to provoke. Turns are the
    // expensive unit here — the free tier paces requests at roughly one every
    // six seconds — which is exactly why the tools take lists.
    maxTurns: 12,
    budgetMs,
    toolMode: "any",
    temperature: 0,
    limiter,
    tracer,
    signal,
  });

  return {
    pairs: collect(context),
    mapped: context.mapped.size,
    unmatched: context.unmatched.size,
    unanswered: context.unanswered.size,
    status: result.status,
    notes: result.result?.notes,
    turns: result.turns,
    usage: result.usage,
  };
}

/**
 * Every answer gets a pair, not just the mapped ones.
 *
 * The step overwrites what is already in the database, so a block the agent
 * decided matches nothing this time has to be written back as null — otherwise
 * a re-run after a timeout would leave the previous attempt's mapping in place
 * and quietly contradict the decision that was just made.
 */
function collect(ctx: Context): AnswerMapping["pairs"] {
  return ctx.answers.map((answer, position) => ({
    answerId: answer.id,
    questionId: ctx.mapped.get(refFor(position))?.questionId ?? null,
  }));
}

/** The two lists, as the agent sees them. */
function brief(questions: QuestionRecord[], answers: AnswerRecord[]): string {
  const paper = questions
    .map((question) => {
      const marks =
        question.maxMarks === null ? "marks not printed" : `${question.maxMarks} marks`;
      return `question "${question.number}"  [${marks}]\n  ${collapse(question.text, 700)}`;
    })
    .join("\n\n");

  const sheet = answers
    .map((answer, position) => {
      const pages = [...new Set(answer.regions.map((r) => r.pageIndex + 1))];
      const where = pages.length ? `page ${pages.join(" and ")}` : "page unknown";
      return `[${refFor(position)}]  label written: ${quote(answer.labelWritten)}  ·  ${where}\n  ${collapse(answer.transcript, 700)}`;
    })
    .join("\n\n");

  return `=== QUESTION PAPER — ${questions.length} question(s), in printed order ===

${paper}

=== ANSWER SHEET — ${answers.length} block(s), in the order the student wrote them ===

${sheet}

Decide which question each block answers, mark the blocks and questions that have no counterpart, then call finish.`;
}

function resolveAnswer(
  ref: string,
  ctx: Context,
): { ref: string; record: AnswerRecord } {
  const normalized = ref.trim().toLowerCase();
  const position = Number(normalized.slice(1)) - 1;
  const record = ctx.answers[position];
  if (!record) {
    throw new Error(
      `There is no block "${ref}". The blocks are a1 to a${ctx.answers.length}.`,
    );
  }
  return { ref: normalized, record };
}

/**
 * Questions are addressed by their printed number rather than by position,
 * because the two diverge the moment a question has sub-parts: on a paper where
 * 11 splits into (a) and (b), the twelfth entry is printed "11 (b)" and the
 * thirteenth is printed "12". A model given positions will sooner or later use
 * the number it can see, and the mistake is silent. The number is what it can
 * see, so the number is the address.
 *
 * `normalizeLabel` is the fallback, and the same function answer extraction
 * uses to stitch page breaks: it forgives "11(a)" for "11 (a)" and "Q7" for
 * "7", which are spelling differences rather than different questions.
 */
function resolveQuestion(number: string, ctx: Context): QuestionRecord {
  const raw = number.trim();
  const exact = ctx.byNumber.get(raw);
  if (exact) return exact;

  const key = normalizeLabel(raw);
  const loose = key ? ctx.byNormalized.get(key) : undefined;
  if (loose) return loose;

  throw new Error(
    `This paper has no question "${number}". Its questions are: ${ctx.questions
      .map((q) => `"${q.number}"`)
      .join(", ")}. A block whose label names a question that is not on this list is unmatched, not a near miss to be corrected.`,
  );
}

/**
 * First writer wins, so a duplicated number cannot make the second question
 * unreachable by silently taking over its key — the ambiguity stays visible as
 * a question that never gets a decision, which `finish` then reports.
 */
function index(questions: QuestionRecord[]): Map<string, QuestionRecord> {
  const byNormalized = new Map<string, QuestionRecord>();
  for (const question of questions) {
    const key = normalizeLabel(question.number);
    if (key && !byNormalized.has(key)) byNormalized.set(key, question);
  }
  return byNormalized;
}

/** What still has no decision, in the shape the model is told to fix. */
function outstanding(ctx: Context) {
  const claimed = new Set(
    [...ctx.mapped.values()].map((decision) => decision.questionId),
  );

  return {
    blocksStillToDecide: ctx.answers
      .map((_, position) => refFor(position))
      .filter((ref) => !ctx.mapped.has(ref) && !ctx.unmatched.has(ref)),
    questionsStillToDecide: ctx.questions
      .filter((q) => !claimed.has(q.id) && !ctx.unanswered.has(q.id))
      .map((q) => q.number),
  };
}

function summarise(ctx: Context) {
  return {
    mapped: ctx.mapped.size,
    unmatched: ctx.unmatched.size,
    unanswered: ctx.unanswered.size,
  };
}

function refFor(position: number): string {
  return `a${position + 1}`;
}

function quote(value: string | null): string {
  return value ? `"${value}"` : "none";
}

/** Newlines flattened so one block stays one visually distinct entry. */
function collapse(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
}
