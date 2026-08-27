import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { documentMetaSchema } from "@/lib/exam/schema";
import type {
  Box2d,
  DocumentMeta,
  ExamStage,
  ExamStatus,
  QuestionDraft,
  QuestionRecord,
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
};

export type { QuestionDraft, QuestionRecord };

export async function loadExam(
  supabase: Supa,
  id: string,
): Promise<ExamRecord | null> {
  const { data, error } = await supabase
    .from("exams")
    .select("id, status, stage, progress, error, updated_at, question_paper, answer_sheet")
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
