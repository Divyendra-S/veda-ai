"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { advanceExam, examQueryOptions, HttpError } from "@/lib/queries/exam";
import { queryKeys } from "@/lib/queries/keys";

/** Long enough for a slow multi-page paper on a rate-limited free tier, short
 *  enough that a genuinely stuck run stops rather than looping all afternoon. */
const OVERALL_DEADLINE_MS = 15 * 60_000;

/** Consecutive transient faults tolerated before the run is reported failed.
 *  A cold serverless function, a dropped connection and a 502 on the way to
 *  the region are all things that come right on the next call; the run has
 *  already survived them by the time a teacher would have finished reading the
 *  error message. */
const MAX_TRANSIENT_FAILURES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Drives one exam to completion and reports its state.
 *
 * Two mechanisms, deliberately separated: the query polls for state, and the
 * mutation pushes the pipeline along. `POST /run` returning `{ done: false }`
 * is the normal way an invocation ends before its serverless timeout, so the
 * mutation keeps calling until the pipeline says it is finished — while the
 * poll keeps the screen honest about which stage is actually running.
 *
 * `retry` is the only thing that restarts a run that has already failed, and
 * the flag rides on the *first* call of that attempt only. Sending it on every
 * call would turn the loop into something that quietly resurrects a hopeless
 * extraction instead of stopping at it.
 */
export function useExamPipeline(id: string) {
  const client = useQueryClient();
  const query = useQuery(examQueryOptions(id));
  const started = useRef(false);

  const {
    mutate,
    isPending,
    error: runError,
  } = useMutation({
    mutationFn: async ({ retry = false }: { retry?: boolean } = {}) => {
      const deadline = Date.now() + OVERALL_DEADLINE_MS;
      let failures = 0;
      let resume = retry;

      while (Date.now() < deadline) {
        try {
          const result = await advanceExam(id, { retry: resume });
          resume = false;
          failures = 0;
          await client.invalidateQueries({ queryKey: queryKeys.exam(id) });
          if (result.done) return result;
          // `busy` means another invocation holds the lease — back off rather
          // than racing it and paying for the same extraction twice.
          await sleep(result.busy ? 3_000 : 250);
        } catch (error) {
          // A fetch that never reached the server throws a TypeError with no
          // status, which is exactly the case worth retrying — so anything
          // that is not a definite answer from the server counts as transient.
          const transient = error instanceof HttpError ? error.transient : true;
          failures += 1;
          if (!transient || failures > MAX_TRANSIENT_FAILURES) throw error;
          await sleep(failures * 2_000);
        }
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
    mutate({});
  }, [status, mutate]);

  const retry = () => {
    started.current = true;
    mutate({ retry: true });
  };

  return {
    exam: query.data,
    isLoading: query.isLoading,
    isRunning: isPending,
    error: query.error ?? runError ?? null,
    /** Re-runs the failed step. Nothing is uploaded again. */
    retry,
    /** Re-reads the snapshot. For when the load itself is what failed and
     *  there is no run to resume. */
    reload: () => {
      void query.refetch();
    },
  };
}
