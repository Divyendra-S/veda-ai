import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadExam, loadQuestions } from "@/lib/exam/repository";
import { signPages } from "@/lib/exam/pages";
import type { ExamSnapshot } from "@/lib/exam/types";

export const dynamic = "force-dynamic";

/**
 * Everything the review screen needs in one response: status for the loading
 * state, the question register, and signed page URLs for the viewer. React
 * Query polls this while a run is in flight, so it must always reflect real
 * state rather than an optimistic guess.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/exams/[id]">,
) {
  const { id } = await ctx.params;
  const supabase = createServerSupabase();

  const exam = await loadExam(supabase, id);
  if (!exam) {
    return NextResponse.json({ error: "No such exam." }, { status: 404 });
  }

  const [questions, questionPages, answerPages] = await Promise.all([
    loadQuestions(supabase, id),
    signPages(supabase, exam.questionPaper.pages),
    signPages(supabase, exam.answerSheet.pages),
  ]);

  // Typed against ExamSnapshot so the client and this handler cannot drift.
  return NextResponse.json<ExamSnapshot>({
    id: exam.id,
    status: exam.status,
    stage: exam.stage,
    progress: exam.progress,
    error: exam.error,
    questionPaper: {
      name: exam.questionPaper.name,
      sizeBytes: exam.questionPaper.sizeBytes,
      pages: questionPages,
    },
    answerSheet: {
      name: exam.answerSheet.name,
      sizeBytes: exam.answerSheet.sizeBytes,
      pages: answerPages,
    },
    questions,
  });
}
