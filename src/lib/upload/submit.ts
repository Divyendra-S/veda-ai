"use client";

import { PAGE_BUCKET } from "@/lib/exam/storage";
import { rasterize, type RasterPage } from "@/lib/pdf/rasterize";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { FileSelection } from "@/lib/upload/selection";

export type SubmitStage = "rasterizing" | "uploading" | "creating";

export type SubmitProgress = {
  stage: SubmitStage;
  done: number;
  total: number;
};

type UploadTicket = { index: number; path: string; token: string };

/** Three at a time: enough to saturate a normal connection, few enough that a
 *  flaky one does not time out every request at once. */
const UPLOAD_CONCURRENCY = 3;

/**
 * Rasterize both documents, create the exam row, push every page to Storage
 * through its signed URL, and hand back the exam id. The page bitmaps produced
 * here are the ones the model and the viewer both see — see
 * `lib/pdf/rasterize.ts`.
 */
export async function submitExam({
  questionPaper,
  answerSheet,
  onProgress,
  signal,
}: {
  questionPaper: FileSelection;
  answerSheet: FileSelection;
  onProgress?: (progress: SubmitProgress) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const totalPages =
    (questionPaper.pageCount ?? questionPaper.files.length) +
    (answerSheet.pageCount ?? answerSheet.files.length);

  let rasterized = 0;
  const report = (stage: SubmitStage, done: number, total: number) =>
    onProgress?.({ stage, done, total });

  const questionPages = await rasterize(questionPaper.files, (done, total) => {
    report("rasterizing", rasterized + done, Math.max(totalPages, total));
  });
  rasterized += questionPages.length;
  signal?.throwIfAborted();

  const answerPages = await rasterize(answerSheet.files, (done) => {
    report("rasterizing", rasterized + done, totalPages);
  });
  rasterized += answerPages.length;
  signal?.throwIfAborted();

  report("creating", 0, 1);
  const response = await fetch("/api/exams", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      questionPaper: describe(questionPaper, questionPages),
      answerSheet: describe(answerSheet, answerPages),
    }),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.error ?? "Could not create the exam.");
  }

  const { examId, uploads } = (await response.json()) as {
    examId: string;
    uploads: { question: UploadTicket[]; answer: UploadTicket[] };
  };

  const jobs = [
    ...pair(questionPages, uploads.question),
    ...pair(answerPages, uploads.answer),
  ];

  let uploaded = 0;
  report("uploading", 0, jobs.length);
  await runLimited(jobs, UPLOAD_CONCURRENCY, async (job) => {
    signal?.throwIfAborted();
    await uploadPage(job);
    uploaded += 1;
    report("uploading", uploaded, jobs.length);
  });

  return examId;
}

function describe(selection: FileSelection, pages: RasterPage[]) {
  return {
    name: selection.label,
    sizeBytes: selection.sizeBytes,
    mimeType: pages[0]?.blob.type ?? "image/png",
    pages: pages.map((page) => ({
      index: page.index,
      width: page.width,
      height: page.height,
    })),
  };
}

function pair(pages: RasterPage[], tickets: UploadTicket[]) {
  const byIndex = new Map(tickets.map((ticket) => [ticket.index, ticket]));
  return pages.map((page) => {
    const ticket = byIndex.get(page.index);
    if (!ticket) throw new Error(`No upload URL for page ${page.index}.`);
    return { page, ticket };
  });
}

async function uploadPage({
  page,
  ticket,
}: {
  page: RasterPage;
  ticket: UploadTicket;
}) {
  const supabase = createBrowserSupabase();
  const { error } = await supabase.storage
    .from(PAGE_BUCKET)
    .uploadToSignedUrl(ticket.path, ticket.token, page.blob, {
      contentType: page.blob.type,
    });
  if (error) throw new Error(`Upload failed for page ${page.index + 1}.`);
}

/** A tiny concurrency limiter. Workers pull from a shared cursor, so a slow
 *  page never blocks the ones behind it the way batching would. */
async function runLimited<T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<void>,
) {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await run(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
}
