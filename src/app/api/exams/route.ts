import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { PAGE_BUCKET, extensionFor } from "@/lib/exam/storage";

/** Guards the Gemini free tier against someone dropping in a 200-page scan. */
const MAX_PAGES_PER_DOCUMENT = 30;

const pageSpec = z.object({
  index: z.number().int().min(0),
  width: z.number().int().positive().max(8000),
  height: z.number().int().positive().max(8000),
});

const documentSpec = z.object({
  name: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  mimeType: z.enum(["image/webp", "image/jpeg", "image/png"]),
  pages: z.array(pageSpec).min(1).max(MAX_PAGES_PER_DOCUMENT),
});

const body = z.object({
  questionPaper: documentSpec,
  answerSheet: documentSpec,
});

type DocumentSpec = z.infer<typeof documentSpec>;

/**
 * Creates the exam row and hands back one short-lived signed upload URL per
 * page. The browser PUTs the rasterized pages straight to Storage, so a
 * six-page answer sheet never passes through this function — but the bucket
 * still has no anonymous write policy.
 */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", detail: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const examId = crypto.randomUUID();
  const supabase = createServerSupabase();

  const question = plan(examId, "question", parsed.data.questionPaper);
  const answer = plan(examId, "answer", parsed.data.answerSheet);

  const { error: insertError } = await supabase.from("exams").insert({
    id: examId,
    status: "pending",
    stage: "queued",
    question_paper: question.meta,
    answer_sheet: answer.meta,
  });

  if (insertError) {
    return NextResponse.json(
      { error: "Could not create the exam.", detail: insertError.message },
      { status: 500 },
    );
  }

  try {
    const [questionUploads, answerUploads] = await Promise.all([
      signAll(supabase, question.paths),
      signAll(supabase, answer.paths),
    ]);

    return NextResponse.json({
      examId,
      uploads: { question: questionUploads, answer: answerUploads },
    });
  } catch (error) {
    // The row would otherwise sit forever pointing at objects that can never
    // be written.
    await supabase.from("exams").delete().eq("id", examId);
    return NextResponse.json(
      {
        error: "Could not prepare the upload.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

function plan(
  examId: string,
  side: "question" | "answer",
  spec: DocumentSpec,
) {
  const extension = extensionFor(spec.mimeType);
  const pages = spec.pages.map((page) => ({
    index: page.index,
    width: page.width,
    height: page.height,
    path: `${examId}/${side}/${String(page.index).padStart(3, "0")}.${extension}`,
  }));

  return {
    paths: pages.map((page) => ({ index: page.index, path: page.path })),
    meta: { name: spec.name, sizeBytes: spec.sizeBytes, pages },
  };
}

async function signAll(
  supabase: ReturnType<typeof createServerSupabase>,
  paths: { index: number; path: string }[],
) {
  return Promise.all(
    paths.map(async ({ index, path }) => {
      const { data, error } = await supabase.storage
        .from(PAGE_BUCKET)
        .createSignedUploadUrl(path);
      if (error || !data) {
        throw new Error(error?.message ?? `Could not sign ${path}.`);
      }
      return { index, path, token: data.token };
    }),
  );
}
