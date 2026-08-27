/**
 * The step runner.
 *
 * Serverless functions time out and a multi-page extraction will not reliably
 * finish inside one invocation, so the pipeline is a list of steps rather than
 * one long function. Each step persists its own output and moves the exam's
 * stage forward before the next begins, which makes re-entry idempotent: a run
 * that dies halfway through a step redoes that step and nothing else.
 *
 * The four steps are also the four agents: each one's `stage` is the name its
 * traces are written under, which is why `StepStage` is an intersection of the
 * two unions rather than either one alone.
 *
 * Steps are grouped into phases, and a phase's steps run **concurrently**.
 * Reading the question paper and reading the answer sheet share a phase
 * because neither one reads anything the other writes — they were only ever
 * sequential because a list is sequential, and running them one after the
 * other made a teacher wait for the question paper before the answer sheet was
 * even opened. Matching needs both, so it is a phase of its own, and grading
 * needs the matching.
 */

import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { defaultRpm, RateLimiter } from "@/lib/agent/limiter";
import { createDbTracer, type AgentName, type Tracer } from "@/lib/agent/trace";
import { extractAnswers } from "@/lib/extraction/answers";
import { extractQuestions } from "@/lib/extraction/questions";
import { gradeExam } from "@/lib/extraction/grading";
import { mapAnswers } from "@/lib/extraction/mapping";
import {
  applyMapping,
  loadAnswers,
  loadExam,
  loadQuestions,
  patchExam,
  replaceAnswers,
  replaceGradings,
  replaceQuestions,
  saveSummary,
  type ExamRecord,
  type Supa,
} from "@/lib/exam/repository";
import type { ExamStage } from "@/lib/exam/types";

/** Every step's stage is also its `agent_traces.agent` name, which is why the
 *  two unions are kept in step. */
export type StepStage = Exclude<ExamStage, "queued" | "done"> & AgentName;

type StepContext = {
  supabase: Supa;
  exam: ExamRecord;
  tracer: Tracer;
  /** This step's share of the key's request budget. See `rpmShare`. */
  limiter: RateLimiter;
  signal?: AbortSignal;
  /** Wall-clock ceiling for this whole invocation, not just this step. */
  deadline: number;
};

type Step = {
  stage: StepStage;
  /** Steps sharing a phase number run at the same time. */
  phase: number;
  /** The exam's `progress` once this step has completed. */
  progress: number;
  run: (ctx: StepContext) => Promise<void>;
};

const STEPS: Step[] = [
  {
    stage: "questions",
    phase: 0,
    progress: 40,
    run: async ({ supabase, exam, tracer, limiter, signal, deadline }) => {
      const extraction = await extractQuestions({
        supabase,
        exam,
        tracer,
        limiter,
        signal,
        // Leave the invocation a few seconds to persist what came back rather
        // than letting the agent run right up to the deadline and lose it.
        budgetMs: Math.max(15_000, deadline - Date.now() - 10_000),
      });

      if (extraction.questions.length === 0) {
        throw new Error(
          extraction.status === "done"
            ? "No questions were found in this paper."
            : `Question extraction stopped early (${extraction.status}) without recording anything.`,
        );
      }

      await replaceQuestions(supabase, exam.id, extraction.questions);
    },
  },
  {
    stage: "answers",
    phase: 0,
    progress: 70,
    run: async ({ supabase, exam, tracer, limiter, signal, deadline }) => {
      const extraction = await extractAnswers({
        supabase,
        exam,
        tracer,
        limiter,
        signal,
        budgetMs: Math.max(15_000, deadline - Date.now() - 10_000),
      });

      // A blank answer sheet is a legitimate result — every question simply
      // goes unanswered — so unlike the question register, an empty list here
      // is recorded rather than treated as a failed extraction.
      await replaceAnswers(supabase, exam.id, extraction.answers);
    },
  },
  {
    stage: "mapping",
    phase: 1,
    progress: 85,
    run: async ({ supabase, exam, tracer, limiter, signal, deadline }) => {
      const [questions, answers] = await Promise.all([
        loadQuestions(supabase, exam.id),
        loadAnswers(supabase, exam.id),
      ]);

      // Nothing was written on the sheet. There is no matching to do and no
      // reason to spend a model call finding that out — every question falls
      // through to grading as unanswered, which is the correct outcome.
      if (answers.length === 0) return;

      const mapping = await mapAnswers({
        questions,
        answers,
        tracer,
        limiter,
        signal,
        budgetMs: Math.max(15_000, deadline - Date.now() - 10_000),
      });

      await applyMapping(supabase, exam.id, mapping.pairs);
    },
  },
  {
    stage: "grading",
    phase: 2,
    progress: 100,
    run: async ({ supabase, exam, tracer, limiter, signal, deadline }) => {
      // Re-read rather than carrying the mapping across from the previous
      // step: the two steps have to work in separate invocations anyway, so
      // reading what was persisted is the path that is always exercised.
      const [questions, answers] = await Promise.all([
        loadQuestions(supabase, exam.id),
        loadAnswers(supabase, exam.id),
      ]);

      const result = await gradeExam({
        questions,
        answers,
        tracer,
        limiter,
        signal,
        budgetMs: Math.max(15_000, deadline - Date.now() - 10_000),
      });

      await replaceGradings(supabase, exam.id, result.gradings);
      await saveSummary(supabase, exam.id, result.summary);
    },
  },
];

/** A run that has been quiet for this long is treated as a dead invocation. */
const LEASE_MS = 90_000;

export type AdvanceResult = {
  done: boolean;
  stage: ExamStage;
  status: ExamRecord["status"];
  /** Set when another invocation currently holds the lease. */
  busy?: boolean;
};

export async function advanceExam(
  examId: string,
  {
    deadline,
    signal,
    retry = false,
  }: { deadline: number; signal?: AbortSignal; retry?: boolean },
): Promise<AdvanceResult> {
  const supabase = createServerSupabase();
  const exam = await loadExam(supabase, examId);
  if (!exam) throw new ExamNotFound(examId);

  if (exam.status === "done" || exam.stage === "done") {
    return { done: true, stage: "done", status: exam.status };
  }
  if (exam.status === "error") {
    // A failed run is terminal until someone asks for it again. `retry` is
    // that ask, and it resumes from the stage that failed rather than from the
    // beginning: every step replaces its own output, so the steps that already
    // finished stay finished and nothing is re-uploaded or re-extracted.
    if (!retry) return { done: true, stage: exam.stage, status: "error" };
    await patchExam(supabase, examId, { status: "running", error: null });
  }
  // Two tabs, or a client that retried while the first call was still working.
  // Reporting `busy` lets the caller keep polling instead of running the same
  // extraction twice and paying for it twice.
  // Deliberately not applied to the retry above: an errored exam has no live
  // invocation to collide with, so a lease left behind by the run that failed
  // must not be able to refuse the retry that follows it.
  if (
    exam.status === "running" &&
    Date.now() - Date.parse(exam.updatedAt) < LEASE_MS
  ) {
    return { done: false, stage: exam.stage, status: "running", busy: true };
  }

  const phases = groupIntoPhases(STEPS);
  let index = phases.findIndex((phase) =>
    phase.some((step) => step.stage === exam.stage),
  );
  if (index < 0) index = 0;

  try {
    for (; index < phases.length; index += 1) {
      const phase = phases[index];
      if (Date.now() >= deadline) {
        return { done: false, stage: phase[0].stage, status: "running" };
      }

      // The stage the screen shows while a phase runs is its first step's.
      // Two steps cannot both be the current stage, and naming the one a
      // teacher is waiting on is more useful than inventing a compound name.
      await patchExam(supabase, examId, {
        status: "running",
        stage: phase[0].stage,
        error: null,
      });

      await runPhase(phase, { supabase, examId, exam, signal, deadline });

      const next = phases[index + 1];
      await patchExam(supabase, examId, {
        stage: next ? next[0].stage : "done",
        progress: Math.max(...phase.map((step) => step.progress)),
      });
    }

    await patchExam(supabase, examId, {
      status: "done",
      stage: "done",
      progress: 100,
    });
    return { done: true, stage: "done", status: "done" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The stage recorded on a failure is the step that actually broke, not the
    // one the phase is named after — the review screen reads it to say what
    // failed and what survived, and with two steps in flight the name of the
    // phase is a coin flip between them.
    const stage = error instanceof StepFailure ? error.stage : exam.stage;
    await patchExam(supabase, examId, { status: "error", stage, error: message });
    return { done: true, stage, status: "error" };
  }
}

/** Steps in declaration order, bucketed by phase. */
function groupIntoPhases(steps: Step[]): Step[][] {
  const byPhase = new Map<number, Step[]>();
  for (const step of steps) {
    const bucket = byPhase.get(step.phase);
    if (bucket) bucket.push(step);
    else byPhase.set(step.phase, [step]);
  }
  return [...byPhase.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, bucket]) => bucket);
}

/**
 * Runs one phase's steps together and fails as soon as any of them does.
 *
 * `allSettled` rather than `all`, so a step that succeeds beside a step that
 * fails still gets to persist what it read — a failed answer-sheet extraction
 * should not throw away a question register that came back clean. The first
 * rejection is then rethrown carrying its own stage.
 *
 * Retrying a failed phase re-runs every step in it, including the ones that
 * succeeded. That is one wasted extraction on a retry, in exchange for not
 * having to track per-step completion; every step replaces its own output, so
 * the result is the same either way.
 */
async function runPhase(
  phase: Step[],
  {
    supabase,
    examId,
    exam,
    signal,
    deadline,
  }: {
    supabase: Supa;
    examId: string;
    exam: ExamRecord;
    signal?: AbortSignal;
    deadline: number;
  },
): Promise<void> {
  const rpm = rpmShare(phase.length);

  const outcomes = await Promise.allSettled(
    phase.map(async (step) => {
      const tracer = createDbTracer(supabase, examId, step.stage);
      const limiter = new RateLimiter({
        rpm,
        signal,
        onRetry: (info) => tracer.emit(0, { kind: "retry", ...info }),
      });
      try {
        await step.run({ supabase, exam, tracer, limiter, signal, deadline });
      } catch (error) {
        throw new StepFailure(step.stage, error);
      } finally {
        await tracer.flush();
      }
    }),
  );

  const failure = outcomes.find((outcome) => outcome.status === "rejected");
  if (failure) throw failure.reason;
}

/**
 * The per-step slice of the key's request budget.
 *
 * Concurrent steps each hold their own bucket — which keeps a retry traceable
 * to the agent that provoked it — so the buckets have to be told about each
 * other, or two steps at 10 RPM would together fire at 20 and turn the pacing
 * into an invitation to be rate-limited.
 */
function rpmShare(lanes: number): number {
  return Math.max(1, defaultRpm() / lanes);
}

/** Carries the stage that failed out of a phase running several steps. */
class StepFailure extends Error {
  constructor(
    readonly stage: StepStage,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "StepFailure";
    this.cause = cause;
  }
}

export class ExamNotFound extends Error {
  constructor(id: string) {
    super(`No exam with id ${id}.`);
    this.name = "ExamNotFound";
  }
}
