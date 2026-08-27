import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { documentMetaSchema } from "@/lib/exam/schema";
import type {
  AnswerDraft,
  AnswerRecord,
  AnswerRegion,
  AnswerStatus,
  Box2d,
  DocumentMeta,
  ExamStage,
  ExamStatus,
  ExamSummary,
  GradingRecord,
  QuestionDraft,
  QuestionRecord,
  Verdict,
} from "@/lib/exam/types";

export type Supa = SupabaseClient<Database>;

export type ExamRecord = {
  id: string;
  status: ExamStatus;
  stage: ExamStage;
  progress: number;
  error: string | null;
  updatedAt: string;
  questionPaper: DocumentMeta;
  answerSheet: DocumentMeta;
  summary: ExamSummary | null;
};

export type {
  AnswerDraft,
  AnswerRecord,
  ExamSummary,
  GradingRecord,
  QuestionDraft,
  QuestionRecord,
};

export async function loadExam(
  supabase: Supa,
  id: string,
): Promise<ExamRecord | null> {
  const { data, error } = await supabase
    .from("exams")
    .select("id, status, stage, progress, error, updated_at, question_paper, answer_sheet, summary")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Could not load exam ${id}: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    // The generated types widen a check constraint to `string`; the unions live
    // in exam/types.ts and are the ones the rest of the app reasons about.
    status: data.status as ExamStatus,
    stage: data.stage as ExamStage,
    progress: data.progress,
    error: data.error,
    updatedAt: data.updated_at,
    questionPaper: documentMetaSchema.parse(data.question_paper),
    answerSheet: documentMetaSchema.parse(data.answer_sheet),
    // Written by this app in one place and never by hand, so it is read back
    // as-is rather than re-validated on every poll.
    summary: (data.summary as ExamSummary | null) ?? null,
  };
}

export async function patchExam(
  supabase: Supa,
  id: string,
  patch: {
    status?: ExamStatus;
    stage?: ExamStage;
    progress?: number;
    error?: string | null;
  },
): Promise<void> {
  // `updated_at` is written here rather than by a trigger because the run
  // route uses it as a lease: a row that has been "running" for a while with
  // no heartbeat is a dead invocation, not a live one.
  const { error } = await supabase
    .from("exams")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Could not update exam ${id}: ${error.message}`);
}

/**
 * Replaces the whole question register in one shot. Extraction is not
 * incremental from the database's point of view — a re-run after a timeout
 * starts from a blank page — so deleting first is what makes a retry
 * idempotent instead of doubling every question.
 */
export async function replaceQuestions(
  supabase: Supa,
  examId: string,
  drafts: QuestionDraft[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("questions")
    .delete()
    .eq("exam_id", examId);
  if (deleteError) {
    throw new Error(`Could not clear questions: ${deleteError.message}`);
  }
  if (drafts.length === 0) return;

  const { error } = await supabase.from("questions").insert(
    drafts.map((draft, index) => ({
      exam_id: examId,
      order_index: index,
      number: draft.number,
      parent_number: draft.parentNumber,
      part_label: draft.partLabel,
      text: draft.text,
      max_marks: draft.maxMarks,
      page_index: draft.pageIndex,
      box2d: draft.box2d,
    })),
  );
  if (error) throw new Error(`Could not save questions: ${error.message}`);
}

export async function loadQuestions(
  supabase: Supa,
  examId: string,
): Promise<QuestionRecord[]> {
  const { data, error } = await supabase
    .from("questions")
    .select("*")
    .eq("exam_id", examId)
    .order("order_index");

  if (error) throw new Error(`Could not load questions: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    orderIndex: row.order_index,
    number: row.number,
    parentNumber: row.parent_number,
    partLabel: row.part_label,
    text: row.text,
    maxMarks: row.max_marks,
    pageIndex: row.page_index,
    box2d: (row.box2d as Box2d | null) ?? null,
  }));
}

/**
 * Replaces the whole answer set, on the same delete-then-insert grounds as
 * `replaceQuestions`: a step that dies partway through re-runs from a blank
 * page rather than doubling every answer.
 *
 * `status` is derived from `questionId` rather than being passed in, so the two
 * cannot disagree — an answer with no question is exactly what "unmatched"
 * means, and there is no third state to get wrong.
 */
export async function replaceAnswers(
  supabase: Supa,
  examId: string,
  drafts: AnswerDraft[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("answers")
    .delete()
    .eq("exam_id", examId);
  if (deleteError) {
    throw new Error(`Could not clear answers: ${deleteError.message}`);
  }
  if (drafts.length === 0) return;

  const { error } = await supabase.from("answers").insert(
    drafts.map((draft) => ({
      exam_id: examId,
      question_id: draft.questionId,
      label_written: draft.labelWritten,
      transcript: draft.transcript,
      regions: draft.regions,
      confidence: draft.confidence,
      status: statusFor(draft.questionId),
    })),
  );
  if (error) throw new Error(`Could not save answers: ${error.message}`);
}

/**
 * Answers come back in reading order — first region's page, then its position
 * down that page.
 *
 * The table has no `order_index` column and should not have one: unlike the
 * question register, whose order is a property of the printed paper, an
 * answer's place in the list is derived from where it sits on the sheet. An
 * answer with no region at all sorts last, because there is nowhere to put it.
 */
export async function loadAnswers(
  supabase: Supa,
  examId: string,
): Promise<AnswerRecord[]> {
  const { data, error } = await supabase
    .from("answers")
    .select("*")
    .eq("exam_id", examId);

  if (error) throw new Error(`Could not load answers: ${error.message}`);

  return (data ?? [])
    .map((row) => ({
      id: row.id,
      questionId: row.question_id,
      labelWritten: row.label_written,
      transcript: row.transcript,
      regions: (row.regions as AnswerRegion[] | null) ?? [],
      confidence: row.confidence,
      status: row.status as AnswerStatus,
    }))
    .sort((a, b) => readingOrder(a) - readingOrder(b));
}

/** Page and vertical position squashed into one sortable number. */
function readingOrder(answer: AnswerRecord): number {
  const first = answer.regions[0];
  if (!first) return Number.MAX_SAFE_INTEGER;
  return first.pageIndex * 1001 + first.box2d[0];
}

/**
 * "Unmatched" is not a third state an agent can set — it is what having no
 * question *means*. Deriving it in one function keeps `status` and
 * `question_id` from ever telling different stories, whether the row is being
 * inserted by extraction or updated by mapping.
 */
function statusFor(questionId: string | null): AnswerStatus {
  return questionId ? "mapped" : "unmatched";
}

/**
 * Writes the mapping decisions onto the answers that already exist.
 *
 * An update rather than a rewrite: the transcript, the regions and the
 * confidence are answer extraction's output and mapping has no business
 * touching them. Only the two fields that say which question this answers move.
 *
 * Answers the agent never mentioned are left exactly as they are, which for a
 * fresh run means `null` / "unmatched" — the safe default, since an answer we
 * failed to place still has to reach the teacher rather than disappear.
 */
export async function applyMapping(
  supabase: Supa,
  examId: string,
  pairs: { answerId: string; questionId: string | null }[],
): Promise<void> {
  const results = await Promise.all(
    pairs.map(({ answerId, questionId }) =>
      supabase
        .from("answers")
        .update({ question_id: questionId, status: statusFor(questionId) })
        .eq("id", answerId)
        // Scoped to the exam as well as the id: an id from the wrong run can
        // then only match nothing, never another exam's answer.
        .eq("exam_id", examId),
    ),
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) {
    throw new Error(`Could not save the mapping: ${failed.error.message}`);
  }
}

/**
 * Replaces every grade for the exam. Delete-then-insert on the same grounds as
 * the other two registers, and here it also sidesteps the unique index on
 * (exam, question): a re-run cannot collide with its own previous attempt.
 */
export async function replaceGradings(
  supabase: Supa,
  examId: string,
  gradings: GradingRecord[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("gradings")
    .delete()
    .eq("exam_id", examId);
  if (deleteError) {
    throw new Error(`Could not clear gradings: ${deleteError.message}`);
  }
  if (gradings.length === 0) return;

  const { error } = await supabase.from("gradings").insert(
    gradings.map((grading) => ({
      exam_id: examId,
      question_id: grading.questionId,
      marks_awarded: grading.marksAwarded,
      max_marks: grading.maxMarks,
      verdict: grading.verdict,
      feedback: grading.feedback,
    })),
  );
  if (error) throw new Error(`Could not save gradings: ${error.message}`);
}

/**
 * Gradings come back keyed by question, unordered: the review screen renders
 * them beside the question register, which already carries the printed order,
 * so sorting them here would be sorting the same thing twice.
 */
export async function loadGradings(
  supabase: Supa,
  examId: string,
): Promise<GradingRecord[]> {
  const { data, error } = await supabase
    .from("gradings")
    .select("question_id, marks_awarded, max_marks, verdict, feedback")
    .eq("exam_id", examId);

  if (error) throw new Error(`Could not load gradings: ${error.message}`);

  return (data ?? []).map((row) => ({
    questionId: row.question_id,
    marksAwarded: Number(row.marks_awarded),
    maxMarks: Number(row.max_marks),
    verdict: row.verdict as Verdict,
    feedback: row.feedback,
  }));
}

export async function saveSummary(
  supabase: Supa,
  examId: string,
  summary: ExamSummary,
): Promise<void> {
  const { error } = await supabase
    .from("exams")
    .update({ summary, updated_at: new Date().toISOString() })
    .eq("id", examId);
  if (error) throw new Error(`Could not save the summary: ${error.message}`);
}
