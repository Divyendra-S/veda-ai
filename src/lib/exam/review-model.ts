import type {
  AnswerRecord,
  Box2d,
  ExamSnapshot,
  GradingRecord,
  QuestionRecord,
} from "@/lib/exam/types";

/**
 * One drawn box. `id` is the DOM hook the viewer scrolls to, and it is built
 * from the answer's id plus the region's position so an answer split across a
 * page break yields two addressable boxes rather than one ambiguous one.
 */
export type PlacedRegion = {
  id: string;
  pageIndex: number;
  box2d: Box2d;
  /** 1-based position within its target, for the "1/2" suffix on the tab. */
  ordinal: number;
  total: number;
};

/**
 * What a click selects. A question and an unplaceable block are different rows
 * on screen but the same thing to the viewer — a tag and a set of regions — so
 * they share one type and the highlighting code has no second path to get
 * wrong.
 *
 * `regions` is empty for a question nobody answered. That is a real state, not
 * a missing one: the row says so and the viewer stays where it is.
 */
export type Target = {
  key: string;
  tag: string;
  regions: PlacedRegion[];
};

export type ReviewRow = {
  target: Target;
  question: QuestionRecord;
  grading: GradingRecord | null;
  /** Usually one block, occasionally none. A list because nothing stops a
   *  student from answering the same question in two places. */
  answers: AnswerRecord[];
  isPart: boolean;
  /** True when this row opens a new whole-question group, so "11 (b)" indents
   *  under "11 (a)" but "11 (a)" itself does not. */
  startsGroup: boolean;
};

export type ReviewModel = {
  rows: ReviewRow[];
  /** Blocks that matched no question, kept in their own section. An answer the
   *  pipeline could not place is the case a teacher most needs to see, so it is
   *  the one thing that must never be quietly dropped from the screen. */
  unmatched: { target: Target; answer: AnswerRecord }[];
};

export type Tone = "pass" | "warn" | "fail" | "none";

/**
 * The colour of a score pill, derived from the ratio rather than read off the
 * stored verdict. Grading calls 4/5 "partial" because a mark was lost; the
 * design shows 4/5 green, and 80% is the threshold measured off the export.
 * The two scales answer different questions and are deliberately not merged.
 *
 * A question nobody attempted gets neither: zero out of five in red would read
 * as five marks thrown away, which is not what happened.
 */
export function toneFor(grading: GradingRecord | null): Tone {
  if (!grading || grading.verdict === "unanswered") return "none";
  if (grading.maxMarks <= 0) return "none";
  const ratio = grading.marksAwarded / grading.maxMarks;
  if (ratio >= 0.8) return "pass";
  return ratio > 0 ? "warn" : "fail";
}

/**
 * What the round badge and the highlight tab show.
 *
 * The register stores the label exactly as printed — "6.", "11 (a)" — because
 * preserving the paper's own numbering is a requirement, and that verbatim
 * string stays the row's accessible name. The trailing full stop is typography
 * rather than number, so it comes off for the two places the number is set
 * inside a circle or a tab and the punctuation would read as a smudge.
 */
export function displayNumber(value: string): string {
  return value.replace(/[.:)\]]+$/, "").trim();
}

/** Marks land on halves. "2.5", never "2.50"; "4", never "4.0". */
export function formatMarks(marks: number): string {
  return Number.isInteger(marks) ? String(marks) : marks.toFixed(1);
}

function regionsOf(answers: AnswerRecord[]): PlacedRegion[] {
  const flat = answers.flatMap((answer) =>
    answer.regions.map((region, index) => ({
      id: `${answer.id}:${index}`,
      pageIndex: region.pageIndex,
      box2d: region.box2d,
    })),
  );
  return flat.map((region, index) => ({
    ...region,
    ordinal: index + 1,
    total: flat.length,
  }));
}

/** "Q11a" — what the tab above a highlight reads. Built from the printed
 *  number so it matches what the student wrote beside their answer. */
function tagFor(question: QuestionRecord): string {
  return `Q${displayNumber(question.parentNumber)}${question.partLabel ?? ""}`;
}

/**
 * Everything the review screen renders, derived in one place from the one
 * snapshot the API returns. The panels then hold no lookup logic of their own,
 * which is what keeps the left-hand row and the right-hand box referring to
 * the same answer.
 */
export function buildReview(exam: ExamSnapshot): ReviewModel {
  const gradingByQuestion = new Map(
    exam.gradings.map((grading) => [grading.questionId, grading]),
  );

  const answersByQuestion = new Map<string, AnswerRecord[]>();
  for (const answer of exam.answers) {
    if (!answer.questionId) continue;
    const bucket = answersByQuestion.get(answer.questionId);
    if (bucket) bucket.push(answer);
    else answersByQuestion.set(answer.questionId, [answer]);
  }

  const rows = exam.questions.map((question, index) => {
    const answers = answersByQuestion.get(question.id) ?? [];
    return {
      target: {
        key: question.id,
        tag: tagFor(question),
        regions: regionsOf(answers),
      },
      question,
      grading: gradingByQuestion.get(question.id) ?? null,
      answers,
      isPart: Boolean(question.partLabel),
      startsGroup:
        index === 0 ||
        exam.questions[index - 1].parentNumber !== question.parentNumber,
    };
  });

  const unmatched = exam.answers
    .filter((answer) => !answer.questionId)
    .map((answer, index) => ({
      answer,
      target: {
        key: answer.id,
        // What the student wrote, never what we deduced — an unplaceable block
        // is exactly the case where a guessed label would mislead.
        tag: answer.labelWritten
          ? displayNumber(answer.labelWritten)
          : `Block ${index + 1}`,
        regions: regionsOf([answer]),
      },
    }));

  return { rows, unmatched };
}
