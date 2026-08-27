/**
 * Grading and feedback.
 *
 * The last pass, and like mapping it works from text alone: by the time it runs
 * every question has been read, every answer transcribed, and the two have been
 * matched, so grading sees tidy pairs and nothing else.
 *
 * Two things it deliberately does not do.
 *
 * It does not grade a question nobody answered. A blank is zero out of the
 * printed total with the verdict "unanswered", which is arithmetic, not
 * judgement — sending blanks to the model would spend tokens to be told what we
 * already know and open the door to marks being invented for an empty page.
 * Only answered questions are put to it.
 *
 * It does not add up. Every figure in the summary — the total, the percentage,
 * how many were answered, skipped, unplaceable — is computed here from the
 * grades. The model supplies the prose and nothing else. A headline score that
 * disagrees with the marks listed underneath it is the fastest way to lose a
 * teacher's trust in the whole screen, and the only reliable way to prevent it
 * is to not ask.
 */

import "server-only";
import { z } from "zod";
import { runAgent, type AgentRunStatus } from "@/lib/agent/loop";
import { RateLimiter } from "@/lib/agent/limiter";
import { defineToolsFor, ToolRegistry } from "@/lib/agent/tools";
import type { TokenUsage, Tracer } from "@/lib/agent/trace";
import type {
  AnswerRecord,
  ExamSummary,
  GradingRecord,
  QuestionRecord,
  Verdict,
} from "@/lib/exam/types";

const SYSTEM_INSTRUCTION = `You are an experienced teacher marking one student's answer script, and writing the feedback they will read.

Each question below is followed by what this student wrote for it. The answers have already been matched to their questions, so you never have to work out which is which — mark what you are given.

Seven rules.

1. MARK OUT OF WHAT IS PRINTED. Each question carries its own total. Award whole or half marks up to that total and never above it. A 5-mark question wants five marks' worth of content; a 2-mark question asking "which blood vessel carries blood away from the heart" is fully answered by "the arteries", and demanding more from it is not rigour, it is a different question.

2. PART MARKS FOR PART ANSWERS. Most real answers are neither right nor wrong. An answer that names the right structure but misses the mechanism earns some of the marks — decide how much of the question it actually covers, and award that.

3. YOU ARE READING A TRANSCRIPTION OF HANDWRITING. Mark the biology, not the typing. Ignore spelling and punctuation unless the question is about the term itself. Where the transcript says [illegible] a word could not be read, so give the student the benefit of the doubt on that stretch rather than marking it wrong. Where it says [Diagram: ...] the student drew something and the description is what they drew: credit the labels and structures it lists exactly as if you were looking at the drawing. That holds however the transcript happens to word it — if it records a drawing at all, a question that asked for one has been answered, and taking marks off for a missing diagram that the transcript says is there is the single worst mistake available to you here. Deduct for a missing drawing only when nothing in the transcript suggests one exists.

4. MARK WHAT IS ON THE PAGE. Not what the student probably meant, not what they would have written with more time. If a required term is absent, it is absent.

5. FEEDBACK IS WRITTEN TO THE STUDENT, IN THE SECOND PERSON. One or two sentences. Say what specifically earned the marks and what specifically was missing — "You correctly identified the chloroplast and named chlorophyll, but the two stages of photosynthesis were not described." Never generic: "good effort" and "needs more detail" tell a student nothing they can act on. Warm, and honest about what is wrong.

6. ONE STANDARD ACROSS THE PAPER. The answer that earns 3 out of 5 on question 6 should earn 3 out of 5 on question 7 for equivalent work. Do not drift stricter as you go.

7. THE SUMMARY IS PROSE, NOT SUMS. When you finish, write two or three sentences to the student about how the paper went as a whole, plus the specific things they did well and the specific gaps to work on. Do not state totals, scores or percentages anywhere — those are calculated for you and printed alongside, and a figure you write yourself will contradict them.`;

/** One question put to the model, with the answer already attached. */
type Pairing = {
  question: QuestionRecord;
  answers: AnswerRecord[];
};

type Grade = {
  marksAwarded: number;
  maxMarks: number;
  verdict: Verdict;
  feedback: string | null;
};

type Context = {
  pairings: Pairing[];
  byNumber: Map<string, Pairing>;
  grades: Map<string, Grade>;
};

const tool = defineToolsFor<Context>();

const recordGrades = tool({
  name: "record_grades",
  description:
    "Record the mark and the feedback for one or more questions. Grading a question again replaces its previous grade, so a correction is simply another call. Grade as many questions per call as you are ready to.",
  input: z.object({
    grades: z
      .array(
        z.object({
          question: z
            .string()
            .min(1)
            .max(24)
            .describe(
              'The number printed on the question paper, exactly as shown: "7", "11 (a)".',
            ),
          marksAwarded: z
            .number()
            .min(0)
            .describe(
              "Marks earned, from 0 up to this question's total. Halves are fine.",
            ),
          verdict: z
            .enum(["correct", "partial", "incorrect"])
            .describe(
              "Fully correct, partly correct, or not correct. Must agree with the marks you awarded.",
            ),
          feedback: z
            .string()
            .min(1)
            .max(600)
            .describe(
              "One or two sentences written to the student, naming what earned the marks and what was missing.",
            ),
        }),
      )
      .min(1),
  }),
  handler: ({ grades }, ctx) => {
    const adjusted: string[] = [];

    for (const entry of grades) {
      const pairing = resolve(entry.question, ctx);
      const max = pairing.question.maxMarks;
      const awarded = clampMarks(entry.marksAwarded, max);

      if (max !== null && awarded !== entry.marksAwarded) {
        adjusted.push(
          `"${pairing.question.number}": ${entry.marksAwarded} → ${awarded} (out of ${max})`,
        );
      }

      ctx.grades.set(pairing.question.id, {
        marksAwarded: awarded,
        maxMarks: max ?? 0,
        verdict: verdictFor(awarded, max, entry.verdict),
        feedback: entry.feedback.trim(),
      });
    }

    return {
      output: {
        graded: ctx.grades.size,
        of: ctx.pairings.length,
        // Surfaced rather than silently applied: a mark over the total usually
        // means the model has the wrong question, and it can only notice that
        // if it is told.
        adjusted: adjusted.length ? adjusted : undefined,
        stillToGrade: ungraded(ctx),
      },
    };
  },
});

const finish = tool({
  name: "finish",
  description:
    "Finish grading and write the overall feedback. Every question you were given must have a grade first; this refuses until they do.",
  input: z.object({
    overallFeedback: z
      .string()
      .min(1)
      .max(900)
      .describe(
        "Two or three sentences to the student about the paper as a whole. No totals, scores or percentages — those are calculated separately.",
      ),
    strengths: z
      .array(z.string().max(160))
      .max(5)
      .describe(
        'What this student did well, one specific point each: "clear, accurate diagrams with correct labels".',
      ),
    gaps: z
      .array(z.string().max(160))
      .max(5)
      .describe(
        'What to work on, one specific point each: "the two stages of photosynthesis".',
      ),
  }),
  handler: (input, ctx) => {
    const remaining = ungraded(ctx);
    if (remaining.length > 0) {
      return {
        output: {
          error: "questions_ungraded",
          message: `These questions have no grade yet: ${remaining.join(", ")}. Grade them, then call finish again.`,
        },
      };
    }

    return {
      output: { ok: true, graded: ctx.grades.size },
      done: {
        overallFeedback: input.overallFeedback.trim(),
        strengths: input.strengths,
        gaps: input.gaps,
      } satisfies Prose,
    };
  },
});

type Prose = {
  overallFeedback: string;
  strengths: string[];
  gaps: string[];
};

export type GradingResult = {
  gradings: GradingRecord[];
  summary: ExamSummary;
  status: AgentRunStatus | "skipped";
  turns: number;
  usage: TokenUsage;
};

export async function gradeExam({
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
}): Promise<GradingResult> {
  const pairings = pair(questions, answers);
  const unmatched = answers.filter((answer) => !answer.questionId).length;
  const context: Context = {
    pairings,
    byNumber: new Map(pairings.map((p) => [p.question.number.trim(), p])),
    grades: new Map(),
  };

  // Nothing was answered — every question is a blank, and there is no judgement
  // left for a model to make. Worth handling rather than treating as an error:
  // it is what an unrelated answer sheet, or a sheet that failed to map, looks
  // like, and the teacher should still get the screen.
  if (pairings.length === 0) {
    const gradings = withBlanks(questions, context.grades);
    return {
      gradings,
      summary: summarise(questions, gradings, unmatched, {
        overallFeedback:
          "None of the writing on this answer sheet could be matched to a question on this paper, so there is nothing to grade. Check that the two documents belong together.",
        strengths: [],
        gaps: [],
      }),
      status: "skipped",
      turns: 0,
      usage: { promptTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  }

  const result = await runAgent<Context, Prose>({
    systemInstruction: SYSTEM_INSTRUCTION,
    initialParts: [{ text: script(context.pairings, questions.length) }],
    tools: new ToolRegistry<Context>([recordGrades, finish]),
    context,
    // Same reasoning as mapping: turns cost about six seconds each under the
    // free tier's pacing, so record_grades takes a list and a confident run is
    // two or three round trips. The rest is repair headroom.
    maxTurns: 12,
    budgetMs,
    toolMode: "any",
    // Measured, not assumed. Grading the same script four times drifted by up to
    // 1.5 marks in 50, and 0.3 was no steadier than 0 — the wobble was never
    // temperature, it was three questions whose transcripts left it unclear
    // whether the student had drawn the diagram they were asked for. That is
    // fixed in the prompts on both sides of the handover; 0 stays, because a
    // mark is a judgement to be read off, not a sample to be drawn.
    temperature: 0,
    limiter,
    tracer,
    signal,
  });

  const gradings = withBlanks(questions, context.grades);
  return {
    gradings,
    summary: summarise(questions, gradings, unmatched, result.result),
    status: result.status,
    turns: result.turns,
    usage: result.usage,
  };
}

/**
 * The verdict follows the marks whenever there are marks to follow.
 *
 * Asking the model for both and then keeping only one looks wasteful, and is
 * not: naming the judgement before picking a number is what stops "partial"
 * arriving beside 5 out of 5, and the model's own verdict is the only thing
 * left to go on when a paper prints no marks at all — where a bare ratio would
 * read 0 out of 0 and score every question as correct.
 */
function verdictFor(
  awarded: number,
  max: number | null,
  stated: Verdict,
): Verdict {
  if (max === null || max <= 0) return stated;
  if (awarded >= max) return "correct";
  return awarded > 0 ? "partial" : "incorrect";
}

/**
 * Marks land on a half and never exceed the total.
 *
 * Halves because that is how marks are written on paper: 3.7 out of 5 is not a
 * mark a teacher would give, and the model reaching for one is false precision
 * about a judgement that was never that fine.
 */
function clampMarks(marks: number, max: number | null): number {
  const rounded = Math.round(marks * 2) / 2;
  const ceiling = max ?? 0;
  return Math.min(Math.max(0, rounded), ceiling);
}

/** Questions that have an answer, in printed order, with theirs attached. */
function pair(questions: QuestionRecord[], answers: AnswerRecord[]): Pairing[] {
  const byQuestion = new Map<string, AnswerRecord[]>();
  for (const answer of answers) {
    if (!answer.questionId) continue;
    const list = byQuestion.get(answer.questionId);
    if (list) list.push(answer);
    else byQuestion.set(answer.questionId, [answer]);
  }

  return questions
    .map((question) => ({
      question,
      answers: byQuestion.get(question.id) ?? [],
    }))
    .filter((pairing) => pairing.answers.length > 0);
}

/**
 * Fills in the questions the model was never shown. A question with no answer
 * is zero out of its printed total, and `feedback` stays null rather than
 * carrying a sentence like "you did not attempt this" — the verdict already
 * says that, and the screen can word it once instead of the model wording it
 * differently for every blank.
 */
function withBlanks(
  questions: QuestionRecord[],
  graded: Map<string, Grade>,
): GradingRecord[] {
  return questions.map((question) => {
    const grade = graded.get(question.id);
    if (grade) return { questionId: question.id, ...grade };
    return {
      questionId: question.id,
      marksAwarded: 0,
      maxMarks: question.maxMarks ?? 0,
      verdict: "unanswered" as const,
      feedback: null,
    };
  });
}

function summarise(
  questions: QuestionRecord[],
  gradings: GradingRecord[],
  unmatched: number,
  prose: Prose | undefined,
): ExamSummary {
  const totalMarks = round(sum(gradings.map((g) => g.maxMarks)));
  const awardedMarks = round(sum(gradings.map((g) => g.marksAwarded)));
  const unanswered = gradings.filter((g) => g.verdict === "unanswered").length;

  return {
    totalMarks,
    awardedMarks,
    percentage: totalMarks > 0 ? Math.round((awardedMarks / totalMarks) * 100) : 0,
    answered: questions.length - unanswered,
    unanswered,
    unmatched,
    // The run can end without a terminal tool call — out of turns, out of
    // budget — and the grades recorded before that are still worth keeping and
    // showing. Only the prose is missing, so only the prose is defaulted.
    overallFeedback:
      prose?.overallFeedback ??
      "Grading finished before an overall summary could be written. The per-question marks and feedback below are complete.",
    strengths: prose?.strengths ?? [],
    gaps: prose?.gaps ?? [],
  };
}

/** The paper and the student's answers, as the agent sees them. */
function script(pairings: Pairing[], totalQuestions: number): string {
  const body = pairings
    .map(({ question, answers }) => {
      const marks =
        question.maxMarks === null
          ? "no marks printed"
          : `${question.maxMarks} marks`;
      // More than one only when two separate blocks were mapped to the same
      // question — a student who answered it twice. Both are the answer.
      const written = answers
        .map((answer) => answer.transcript.trim())
        .join("\n\n… and, written elsewhere on the sheet:\n\n");

      return `--- question "${question.number}"  [${marks}] ---\n${question.text.trim()}\n\nWhat the student wrote:\n${written}`;
    })
    .join("\n\n");

  const skipped = totalQuestions - pairings.length;
  const note =
    skipped > 0
      ? ` The other ${skipped} question(s) on the paper were not answered and are handled separately — do not grade or mention them individually.`
      : "";

  return `${pairings.length} of the ${totalQuestions} question(s) on this paper were answered, and they follow.${note}

${body}

Grade every question above with record_grades, then call finish with the overall feedback.`;
}

function ungraded(ctx: Context): string[] {
  return ctx.pairings
    .filter((pairing) => !ctx.grades.has(pairing.question.id))
    .map((pairing) => `"${pairing.question.number}"`);
}

/**
 * Exact match only — unlike mapping, which forgives "11(a)" for "11 (a)".
 * There the model is naming a question out of the whole paper and a spelling
 * difference is not a different question; here it is quoting from the short,
 * explicit list printed directly above it, so a number that does not match is
 * more likely the wrong question than a typo, and resolving it loosely would
 * silently attach a mark to the wrong one.
 */
function resolve(number: string, ctx: Context): Pairing {
  const pairing = ctx.byNumber.get(number.trim());
  if (pairing) return pairing;
  throw new Error(
    `"${number}" is not one of the questions you were given to grade. They are: ${ctx.pairings
      .map((p) => `"${p.question.number}"`)
      .join(", ")}.`,
  );
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Guards against float drift accumulating across a page of half marks. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
