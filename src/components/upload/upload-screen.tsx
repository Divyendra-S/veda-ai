"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight } from "lucide-react";
import hero from "@/assets/brand/hero-teacher.png";
import { ProcessingPanel } from "@/components/processing-panel";
import { Button } from "@/components/ui/button";
import { DropCard } from "@/components/upload/drop-card";
import { countPdfPages, PdfPasswordError } from "@/lib/pdf/rasterize";
import {
  toSelection,
  validate,
  type FileSelection,
} from "@/lib/upload/selection";
import { submitExam, type SubmitProgress } from "@/lib/upload/submit";

type Side = "question" | "answer";

const STAGE_TITLES: Record<SubmitProgress["stage"], string> = {
  rasterizing: "Preparing pages…",
  creating: "Preparing pages…",
  uploading: "Uploading…",
};

export function UploadScreen() {
  const router = useRouter();
  const [selections, setSelections] = useState<
    Record<Side, FileSelection | null>
  >({ question: null, answer: null });
  const [errors, setErrors] = useState<Partial<Record<Side, string>>>({});
  const [progress, setProgress] = useState<SubmitProgress | null>(null);

  const setSide = useCallback(
    (side: Side, value: FileSelection | null) =>
      setSelections((previous) => ({ ...previous, [side]: value })),
    [],
  );

  const handleSelect = useCallback(
    async (side: Side, files: File[]) => {
      const problem = validate(files);
      if (problem) {
        setErrors((previous) => ({ ...previous, [side]: problem }));
        return;
      }

      setErrors((previous) => ({ ...previous, [side]: undefined }));
      const selection = toSelection(files);
      setSide(side, selection);
      if (selection.kind !== "pdf") return;

      // Opening the PDF to count pages is async, and the teacher may have
      // swapped the file by the time it resolves. Only apply the count if the
      // slot still holds the same File object.
      try {
        const pageCount = await countPdfPages(files[0]);
        setSelections((previous) =>
          previous[side]?.files[0] === files[0]
            ? { ...previous, [side]: { ...previous[side], pageCount } }
            : previous,
        );
      } catch (error) {
        const message =
          error instanceof PdfPasswordError
            ? error.message
            : "That PDF could not be read.";
        setSelections((previous) =>
          previous[side]?.files[0] === files[0]
            ? { ...previous, [side]: null }
            : previous,
        );
        setErrors((previous) => ({ ...previous, [side]: message }));
      }
    },
    [setSide],
  );

  const submit = useMutation({
    mutationFn: () =>
      submitExam({
        questionPaper: selections.question!,
        answerSheet: selections.answer!,
        onProgress: setProgress,
      }),
    onSuccess: (examId) => router.push(`/exams/${examId}`),
  });

  if (submit.isPending || submit.isSuccess) {
    const stage = progress?.stage ?? "rasterizing";
    return (
      <ProcessingPanel
        title={STAGE_TITLES[stage]}
        progress={progress ? percentOf(progress) : 0}
        detail={
          progress && progress.total > 1
            ? `${progress.done} of ${progress.total} pages`
            : null
        }
      />
    );
  }

  const ready = Boolean(
    selections.question?.pageCount && selections.answer?.pageCount,
  );

  return (
    <section className="scrollbar-slim flex flex-1 flex-col items-center justify-center-safe overflow-y-auto px-2 py-6">
      <h1 className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[26px] leading-none font-bold tracking-[-0.02em] text-ink sm:text-[38px]">
        <span>Upload</span>
        <span className="rounded-xl bg-brand-wash px-3 py-2.5 text-brand">
          Question Paper &amp; Answer Sheets
        </span>
      </h1>
      <p className="mt-3.5 text-center text-[17px] text-ink-soft sm:text-[20px]">
        Upload both files to get started
      </p>

      <Image
        src={hero}
        alt=""
        priority
        className="mt-6 size-[92px] object-contain sm:mt-8 sm:size-[126px]"
      />

      <div className="mt-6 flex w-full max-w-[785px] flex-col gap-3 rounded-panel bg-well p-2 sm:mt-7 sm:flex-row sm:gap-4">
        <DropCard
          title="Question Paper"
          value={selections.question}
          error={errors.question}
          onSelect={(files) => handleSelect("question", files)}
          onClear={() => {
            setSide("question", null);
            setErrors((previous) => ({ ...previous, question: undefined }));
          }}
        />
        <DropCard
          title="Answer Sheet"
          value={selections.answer}
          error={errors.answer}
          onSelect={(files) => handleSelect("answer", files)}
          onClear={() => {
            setSide("answer", null);
            setErrors((previous) => ({ ...previous, answer: undefined }));
          }}
        />
      </div>

      <Button
        className="mt-8 sm:mt-11"
        disabled={!ready}
        onClick={() => submit.mutate()}
      >
        Start Mapping
        <ArrowRight className="size-[18px]" strokeWidth={2.2} />
      </Button>

      {submit.isError ? (
        <p
          role="alert"
          className="mt-4 flex max-w-[520px] items-start gap-2 rounded-[14px] bg-fail-bg px-4 py-2.5 text-[13px] leading-relaxed text-fail"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={2.2} />
          <span>
            {(submit.error as Error).message} Both files are still selected —
            press Start Mapping to try again.
          </span>
        </p>
      ) : (
        <p className="mt-4 px-2 text-center text-[13px] text-faint">
          Once both files are uploaded, you&apos;ll be able to map answers with
          questions
        </p>
      )}
    </section>
  );
}

/**
 * One bar for three stages of unequal length. Rasterizing is the slow half on
 * a scanned paper and uploading is the slow half on a poor connection, so the
 * split is roughly even rather than proportional to the step count — a bar
 * that sprints to 90% and then stops is worse than no bar.
 */
function percentOf(progress: SubmitProgress): number {
  const ratio = progress.total > 0 ? progress.done / progress.total : 0;
  if (progress.stage === "rasterizing") return ratio * 50;
  if (progress.stage === "creating") return 52;
  return 55 + ratio * 45;
}
