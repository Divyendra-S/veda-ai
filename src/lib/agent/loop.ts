/**
 * The agent loop.
 *
 * Hand-rolled rather than taken from an agent SDK, because the whole pipeline
 * turns on details an SDK hides: which parts get replayed into history, whether
 * thought signatures survive a tool round trip, exactly how a bad tool payload
 * is fed back for repair, and where the rate limiter sits. Those are the things
 * that decide whether a bounding box lands on the right line of a page.
 *
 * The shape is the classic one:
 *
 *   send history → model replies with function calls → run them →
 *   append results → send again … until a terminal tool fires or a budget runs out
 *
 * Three points that are easy to get wrong and are load-bearing here:
 *
 *  - The model's own `Content` is appended **verbatim**, never rebuilt from the
 *    text and calls we parsed out. Thinking models attach `thoughtSignature` to
 *    their parts, and dropping it on the next turn makes the model lose its own
 *    reasoning across a tool call.
 *  - Parallel calls in one turn produce **one** user Content holding every
 *    functionResponse. Splitting them into separate turns breaks the pairing.
 *  - A tool never throws at the model. Bad arguments come back as a
 *    functionResponse with an `error`, which is what gives the model a turn to
 *    repair itself instead of failing the run.
 */

import "server-only";
import {
  FunctionCallingConfigMode,
  type Content,
  type GenerateContentResponse,
  type Part,
} from "@google/genai";
import { geminiClient, GEMINI_MODEL } from "@/lib/gemini/client";
import { RateLimiter } from "@/lib/agent/limiter";
import { ToolRegistry } from "@/lib/agent/tools";
import {
  nullTracer,
  redactParts,
  type TokenUsage,
  type Tracer,
} from "@/lib/agent/trace";

export type AgentRunStatus =
  /** A terminal tool fired. `result` is set. */
  | "done"
  /** The model stopped calling tools and answered in prose. `text` is set. */
  | "text"
  | "max_turns"
  | "budget_exhausted";

export type AgentRunResult<TDone = unknown> = {
  status: AgentRunStatus;
  result?: TDone;
  text?: string;
  turns: number;
  usage: TokenUsage;
  history: Content[];
};

export type AgentRunOptions<TCtx> = {
  systemInstruction: string;
  /** The first user turn — instructions, and usually the page images. */
  initialParts: Part[];
  tools: ToolRegistry<TCtx>;
  context: TCtx;
  model?: string;
  /** Hard cap on model round trips. Default 12. */
  maxTurns?: number;
  /** Wall-clock ceiling for the whole run. Default 4 minutes. */
  budgetMs?: number;
  /** Ceiling for a single tool handler. Default 30s. */
  toolTimeoutMs?: number;
  temperature?: number;
  /**
   * "any" forces a function call every turn. Correct for extraction agents,
   * which have a terminal tool and no reason to ever reply in prose.
   */
  toolMode?: "auto" | "any";
  limiter?: RateLimiter;
  tracer?: Tracer;
  signal?: AbortSignal;
};

const DEFAULTS = {
  maxTurns: 12,
  budgetMs: 4 * 60_000,
  toolTimeoutMs: 30_000,
};

export async function runAgent<TCtx, TDone = unknown>(
  options: AgentRunOptions<TCtx>,
): Promise<AgentRunResult<TDone>> {
  const {
    systemInstruction,
    initialParts,
    tools,
    context,
    model = GEMINI_MODEL,
    maxTurns = DEFAULTS.maxTurns,
    budgetMs = DEFAULTS.budgetMs,
    toolTimeoutMs = DEFAULTS.toolTimeoutMs,
    temperature = 0,
    toolMode = "auto",
    tracer = nullTracer,
    signal,
  } = options;

  const deadline = Date.now() + budgetMs;
  const limiter =
    options.limiter ??
    new RateLimiter({
      signal,
      onRetry: (info) => tracer.emit(turn, { kind: "retry", ...info }),
    });

  const ai = geminiClient();
  const declarations = tools.declarations();
  const history: Content[] = [{ role: "user", parts: initialParts }];
  const usage: TokenUsage = { promptTokens: 0, outputTokens: 0, totalTokens: 0 };
  let turn = 0;
  /** Completed model round trips. `turn` is a loop index and undercounts by one. */
  let roundTrips = 0;

  const finish = async (
    result: Omit<AgentRunResult<TDone>, "turns" | "usage" | "history">,
  ): Promise<AgentRunResult<TDone>> => {
    tracer.emit(turn, {
      kind: "finished",
      status: result.status,
      turns: roundTrips,
      usage,
    });
    await tracer.flush();
    return { ...result, turns: roundTrips, usage, history };
  };

  try {
    for (turn = 0; turn < maxTurns; turn += 1) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) return finish({ status: "budget_exhausted" });

      tracer.emit(turn, {
        kind: "request",
        historyLength: history.length,
        parts: redactParts(history.at(-1)?.parts),
      });

      // The request carries its own deadline so a hung call cannot outlive the
      // run's budget. Merged with the caller's signal, not swapped for it.
      const requestSignal = mergeSignals(signal, remainingMs);

      let response: GenerateContentResponse;
      try {
        response = await limiter.run(() =>
          ai.models.generateContent({
            model,
            contents: history,
            config: {
              systemInstruction,
              temperature,
              abortSignal: requestSignal,
              tools: declarations.length ? [{ functionDeclarations: declarations }] : undefined,
              toolConfig:
                toolMode === "any" && declarations.length
                  ? {
                      functionCallingConfig: {
                        mode: FunctionCallingConfigMode.ANY,
                        allowedFunctionNames: tools.names,
                      },
                    }
                  : undefined,
            },
          }),
        );
      } catch (error) {
        // Our own deadline tripped rather than the caller's cancellation.
        if (!signal?.aborted && Date.now() >= deadline) {
          return finish({ status: "budget_exhausted" });
        }
        throw error;
      }

      roundTrips += 1;
      accumulateUsage(usage, response);

      const candidate = response.candidates?.[0];
      const calls = response.functionCalls ?? [];
      const text = response.text;

      tracer.emit(turn, {
        kind: "response",
        text,
        calls: calls.map((call) => ({ name: call.name ?? "", args: call.args })),
        finishReason: candidate?.finishReason,
        usage: { ...usage },
      });

      if (!candidate?.content) {
        throw new Error(
          `Model returned no content (finishReason=${candidate?.finishReason ?? "unknown"}). ` +
            "This is usually a safety block or an empty candidate.",
        );
      }

      // Verbatim — see the note about thoughtSignature at the top of this file.
      history.push(candidate.content);

      if (calls.length === 0) {
        return finish({ status: "text", text });
      }

      const responseParts: Part[] = [];
      const attachments: Part[] = [];
      let done: unknown;
      let doneSeen = false;

      for (const call of calls) {
        const outcome = await tools.dispatch(call, context, {
          timeoutMs: toolTimeoutMs,
          signal,
        });
        responseParts.push(outcome.part);
        if (outcome.attachments?.length) attachments.push(...outcome.attachments);
        if (outcome.done !== undefined && !doneSeen) {
          done = outcome.done;
          doneSeen = true;
        }
        tracer.emit(turn, {
          kind: "tool",
          name: call.name ?? "",
          ok: outcome.ok,
          durationMs: outcome.durationMs,
          args: call.args,
          output: outcome.part.functionResponse?.response,
        });
      }

      // One Content for every response in the turn: Gemini pairs them with the
      // calls positionally, so they must not be split across turns.
      history.push({ role: "user", parts: responseParts });

      // Page images and other blobs ride in a follow-up user turn, because a
      // functionResponse can only carry JSON.
      if (attachments.length) {
        history.push({ role: "user", parts: attachments });
      }

      if (doneSeen) {
        return finish({ status: "done", result: done as TDone });
      }
    }

    return finish({ status: "max_turns" });
  } catch (error) {
    tracer.emit(turn, {
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    });
    await tracer.flush();
    throw error;
  }
}

function accumulateUsage(usage: TokenUsage, response: GenerateContentResponse): void {
  const meta = response.usageMetadata;
  if (!meta) return;
  usage.promptTokens += meta.promptTokenCount ?? 0;
  // Thinking tokens are billed as output but reported separately.
  usage.outputTokens += (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0);
  usage.totalTokens += meta.totalTokenCount ?? 0;
}

function mergeSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
