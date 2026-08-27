/**
 * Run traces.
 *
 * Every turn of every agent is written to `agent_traces`. When an extraction
 * comes back with a question missing or a highlight in the wrong place, the
 * trace is the only way to tell *which* step was wrong — the prompt, the
 * model's call, or the handler — without re-running the whole job and paying
 * for it again.
 *
 * Two rules make tracing safe to leave on:
 *
 *   1. Tracing never fails a run. Every write is best-effort; a broken trace
 *      insert is logged and swallowed.
 *   2. Page images never reach the database. A single rasterised page is ~400KB
 *      of base64; `redactParts` replaces every inline blob with its byte count
 *      before anything is persisted.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Content, Part } from "@google/genai";
import type { Database, Json } from "@/lib/supabase/database.types";

/**
 * Mirrors the `agent_traces.agent` check constraint. Generated DB types widen a
 * check constraint to `string`, so the union is restated here — a typo becomes
 * a build error instead of a row rejected at insert time.
 */
export type AgentName = "questions" | "answers" | "mapping" | "grading";

export type TokenUsage = {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type TraceEvent =
  | { kind: "request"; historyLength: number; parts: unknown[] }
  | {
      kind: "response";
      text?: string;
      calls: { name: string; args: unknown }[];
      finishReason?: string;
      usage?: TokenUsage;
    }
  | {
      kind: "tool";
      name: string;
      ok: boolean;
      durationMs: number;
      args: unknown;
      output: unknown;
    }
  | { kind: "retry"; attempt: number; status?: number; delayMs: number; message: string }
  | { kind: "error"; message: string }
  | { kind: "finished"; status: string; turns: number; usage: TokenUsage };

export interface Tracer {
  emit(turn: number, event: TraceEvent): void;
  flush(): Promise<void>;
}

export const nullTracer: Tracer = {
  emit() {},
  async flush() {},
};

/** Strips inline blobs so a trace row stays kilobytes rather than megabytes. */
export function redactParts(parts: Part[] | undefined): unknown[] {
  if (!parts) return [];
  return parts.map((part) => {
    if (part.inlineData?.data) {
      const bytes = Math.round((part.inlineData.data.length * 3) / 4);
      return {
        inlineData: { mimeType: part.inlineData.mimeType, bytes },
      };
    }
    if (part.text !== undefined) {
      return { text: truncate(part.text, 4_000) };
    }
    if (part.functionCall) {
      return { functionCall: { name: part.functionCall.name, args: part.functionCall.args } };
    }
    if (part.functionResponse) {
      return {
        functionResponse: {
          name: part.functionResponse.name,
          response: part.functionResponse.response,
        },
      };
    }
    return { part: "…" };
  });
}

export function redactContents(contents: Content[]): unknown[] {
  return contents.map((content) => ({
    role: content.role,
    parts: redactParts(content.parts),
  }));
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}… (${value.length} chars)`;
}

/**
 * Buffers events and writes them in batches. Extraction runs produce dozens of
 * events; one insert per event would add a network round trip between every
 * turn of an already slow pipeline.
 */
export function createDbTracer(
  supabase: SupabaseClient<Database>,
  examId: string,
  agent: AgentName,
  options: { batchSize?: number } = {},
): Tracer {
  const batchSize = options.batchSize ?? 20;
  let buffer: { exam_id: string; agent: AgentName; turn: number; payload: Json }[] = [];
  let pending: Promise<void> = Promise.resolve();

  const write = async () => {
    if (buffer.length === 0) return;
    const rows = buffer;
    buffer = [];
    const { error } = await supabase.from("agent_traces").insert(rows);
    if (error) {
      console.warn(`[trace] failed to persist ${rows.length} events:`, error.message);
    }
  };

  return {
    emit(turn, event) {
      buffer.push({
        exam_id: examId,
        agent,
        turn,
        payload: event as unknown as Json,
      });
      if (buffer.length >= batchSize) {
        pending = pending.then(write, () => write());
      }
    },
    async flush() {
      pending = pending.then(write, () => write());
      await pending;
    },
  };
}

/** Dev-only. Prints one line per event instead of touching the database. */
export function createConsoleTracer(label: string): Tracer {
  return {
    emit(turn, event) {
      const detail =
        event.kind === "response"
          ? `calls=[${event.calls.map((call) => call.name).join(", ")}] ${
              event.usage ? `${event.usage.totalTokens}tok` : ""
            }`
          : event.kind === "tool"
            ? `${event.name} ok=${event.ok} ${event.durationMs}ms`
            : event.kind === "retry"
              ? `attempt=${event.attempt} status=${event.status} in ${event.delayMs}ms`
              : event.kind === "error"
                ? event.message
                : event.kind === "finished"
                  ? `${event.status} turns=${event.turns} ${event.usage.totalTokens}tok`
                  : `history=${event.historyLength}`;
      console.log(`[${label}] t${turn} ${event.kind.padEnd(8)} ${detail}`);
    },
    async flush() {},
  };
}

/** Fans one stream of events out to several tracers (DB + console in dev). */
export function combineTracers(...tracers: Tracer[]): Tracer {
  return {
    emit(turn, event) {
      for (const tracer of tracers) tracer.emit(turn, event);
    },
    async flush() {
      await Promise.all(tracers.map((tracer) => tracer.flush()));
    },
  };
}
