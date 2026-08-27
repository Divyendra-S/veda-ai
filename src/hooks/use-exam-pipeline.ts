"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { advanceExam, examQueryOptions } from "@/lib/queries/exam";
import { queryKeys } from "@/lib/queries/keys";

/** Long enough for a slow multi-page paper on a rate-limited free tier, short
 *  enough that a genuinely stuck run stops rather than looping all afternoon. */
const OVERALL_DEADLINE_MS = 15 * 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Drives one exam to completion and reports its state.
 *
 * Two mechanisms, deliberately separated: the query polls for state, and the
 * mutation pushes the pipeline along. `POST /run` returning `{ done: false }`
 * is the normal way an invocation ends before its serverless timeout, so the
 * mutation keeps calling until the pipeline says it is finished — while the
 * poll keeps the screen honest about which stage is actually running.
 */
export function useExamPipeline(id: string) {
  const client = useQueryClient();
  const query = useQuery(examQueryOptions(id));
  const started = useRef(false);

  const { mutate, isPending, error: runError } = useMutation({
    mutationFn: async () => {
      const deadline = Date.now() + OVERALL_DEADLINE_MS;
      while (Date.now() < deadline) {
        const result = await advanceExam(id);
        await client.invalidateQueries({ queryKey: queryKeys.exam(id) });
        if (result.done) return result;
        // `busy` means another invocation holds the lease — back off rather
        // than racing it and paying for the same extraction twice.
        await sleep(result.busy ? 3_000 : 250);
      }
      throw new Error(
        "This is taking longer than expected. Reload the page to pick up where it stopped.",
      );
    },
  });

  const status = query.data?.status;

  useEffect(() => {
    if (started.current || !status) return;
    if (status === "done" || status === "error") return;
    started.current = true;
    mutate();
  }, [status, mutate]);

  const retry = () => {
    started.current = true;
    mutate();
  };

  return {
    exam: query.data,
    isLoading: query.isLoading,
    isRunning: isPending,
    error: query.error ?? runError ?? null,
    retry,
  };
}
