import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queries/keys";
import type { ExamSnapshot } from "@/lib/exam/types";

export type AdvanceResponse = {
  done: boolean;
  stage: ExamSnapshot["stage"];
  status: ExamSnapshot["status"];
  busy?: boolean;
};

/**
 * Carries the status code, because the caller's decision to retry depends on
 * it: a 502 from a cold serverless function is worth another go, a 404 for an
 * exam that does not exist never will be.
 */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HttpError";
  }

  /** True for the faults that are worth waiting out rather than reporting. */
  get transient() {
    return this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

async function readError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return new HttpError(body?.error ?? fallback, response.status);
}

export async function fetchExam(
  id: string,
  signal?: AbortSignal,
): Promise<ExamSnapshot> {
  const response = await fetch(`/api/exams/${id}`, { signal });
  if (!response.ok) throw await readError(response, "Could not load the exam.");
  return response.json();
}

export async function advanceExam(
  id: string,
  { retry, signal }: { retry?: boolean; signal?: AbortSignal } = {},
): Promise<AdvanceResponse> {
  const response = await fetch(
    `/api/exams/${id}/run${retry ? "?retry=1" : ""}`,
    { method: "POST", signal },
  );
  if (!response.ok) throw await readError(response, "Extraction failed.");
  return response.json();
}

/** A run in flight is worth polling for; a finished one is not. Returning
 *  `false` from `refetchInterval` is what stops the review screen from holding
 *  a timer open for as long as the tab is left on it. */
export function examQueryOptions(id: string) {
  return queryOptions({
    queryKey: queryKeys.exam(id),
    queryFn: ({ signal }) => fetchExam(id, signal),
    staleTime: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "done" || status === "error" ? false : 2_000;
    },
  });
}
