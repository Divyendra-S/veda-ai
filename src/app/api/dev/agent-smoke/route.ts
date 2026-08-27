/**
 * Phase 3 scratch harness — development only, 404s in production.
 *
 * The agent core is pure infrastructure with no UI, and debugging it through
 * the extraction pipeline would mean paying for a full multi-page run to learn
 * that a tool schema was rejected. This route exercises it in isolation.
 *
 * It runs as a route handler rather than a standalone node script so it uses
 * the real runtime: the same module resolution, the same `server-only` fence,
 * the same env loading as production.
 *
 * Two checks:
 *   limiter — a synthetic 429 storm, absorbed without failing the call
 *   agent   — a multi-turn tool conversation that also proves two things Phase 4
 *             depends on: that Gemini accepts a Zod-generated JSON Schema, and
 *             that an image handed back through `attachments` actually reaches
 *             the model
 */

import { NextResponse } from "next/server";
import { deflateSync } from "node:zlib";
import { z } from "zod";
import { runAgent } from "@/lib/agent/loop";
import { RateLimiter } from "@/lib/agent/limiter";
import { defineToolsFor, ToolRegistry } from "@/lib/agent/tools";
import {
  createConsoleTracer,
  createDbTracer,
  redactParts,
} from "@/lib/agent/trace";
import { GEMINI_MODEL } from "@/lib/gemini/client";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ---------------------------------------------------------------- check 1

/** Fails with 429 a fixed number of times, then succeeds. */
async function limiterCheck() {
  const retries: { attempt: number; status?: number; delayMs: number }[] = [];
  const limiter = new RateLimiter({
    rpm: 600, // fast, so the check does not sit for a minute
    burst: 4,
    maxRetries: 5,
    baseDelayMs: 20,
    maxDelayMs: 80,
    onRetry: ({ attempt, status, delayMs }) => retries.push({ attempt, status, delayMs }),
  });

  let calls = 0;
  const startedAt = Date.now();
  const value = await limiter.run(async () => {
    calls += 1;
    if (calls <= 3) {
      throw Object.assign(new Error('{"error":{"code":429,"retryDelay":"0.05s"}}'), {
        status: 429,
      });
    }
    return "recovered";
  });

  // A non-retryable failure must still propagate rather than spin.
  let propagated = false;
  try {
    await limiter.run(async () => {
      throw Object.assign(new Error("bad request"), { status: 400 });
    });
  } catch {
    propagated = true;
  }

  return {
    ok: value === "recovered" && retries.length === 3 && propagated,
    calls,
    retries,
    propagatedNonRetryable: propagated,
    elapsedMs: Date.now() - startedAt,
  };
}

// ---------------------------------------------------------------- check 2

const GRID = [
  [4, 9, 2],
  [3, 5, 7],
  [8, 1, 6],
];

const SWATCHES: Record<number, [number, number, number]> = {
  0: [220, 38, 38], // red
  1: [22, 163, 74], // green
};

type SmokeContext = { reads: string[] };

const tool = defineToolsFor<SmokeContext>();

const readCell = tool({
  name: "read_cell",
  description:
    "Read one cell of a hidden 3x3 grid of numbers. Rows and columns are 0-indexed from the top left.",
  input: z.object({
    row: z.number().int().min(0).max(2).describe("Row index, 0 to 2."),
    col: z.number().int().min(0).max(2).describe("Column index, 0 to 2."),
  }),
  handler: ({ row, col }, ctx) => {
    ctx.reads.push(`${row},${col}`);
    return { output: { value: GRID[row][col] } };
  },
});

const revealSwatch = tool({
  name: "reveal_swatch",
  description:
    "Reveal a hidden colour swatch as an image. Call this, then look at the image that follows to name the colour.",
  input: z.object({
    index: z.number().int().min(0).max(1).describe("Which swatch to reveal, 0 or 1."),
  }),
  handler: ({ index }) => ({
    output: { revealed: true, note: "The swatch image follows this message." },
    attachments: [
      {
        inlineData: {
          mimeType: "image/png",
          data: solidPng(SWATCHES[index]).toString("base64"),
        },
      },
    ],
  }),
});

const submitReport = tool({
  name: "submit_report",
  description: "Submit the final answer. Call this exactly once, at the end.",
  input: z.object({
    diagonalSum: z.number().describe("Sum of the grid's top-left to bottom-right diagonal."),
    swatchColour: z.string().describe("The colour of swatch 1, as a single common word."),
  }),
  handler: (report) => ({
    output: { accepted: true },
    done: report,
  }),
});

async function agentCheck(signal: AbortSignal) {
  const context: SmokeContext = { reads: [] };
  const startedAt = Date.now();

  const run = await runAgent<SmokeContext, { diagonalSum: number; swatchColour: string }>({
    model: GEMINI_MODEL,
    systemInstruction:
      "You are a test harness agent. Use the tools to gather what you need, then call " +
      "submit_report exactly once. Do not guess values you have not read.",
    initialParts: [
      {
        text:
          "Two things. First, read the three cells on the grid's main diagonal " +
          "(top-left to bottom-right) and add them up. Second, reveal swatch 1 and tell me " +
          "what colour it is. Then submit the report.",
      },
    ],
    tools: new ToolRegistry<SmokeContext>([readCell, revealSwatch, submitReport]),
    context,
    maxTurns: 8,
    budgetMs: 45_000,
    toolMode: "any",
    tracer: createConsoleTracer("smoke"),
    signal,
  });

  const expectedSum = GRID[0][0] + GRID[1][1] + GRID[2][2];
  const colour = run.result?.swatchColour?.toLowerCase() ?? "";

  return {
    ok:
      run.status === "done" &&
      run.result?.diagonalSum === expectedSum &&
      colour.includes("green"),
    status: run.status,
    result: run.result,
    expectedSum,
    turns: run.turns,
    usage: run.usage,
    cellsRead: context.reads,
    elapsedMs: Date.now() - startedAt,
  };
}

// ---------------------------------------------------------------- check 3

/**
 * The repair path, tested directly rather than by hoping the model gets its
 * arguments wrong. Every model mistake must come back as a functionResponse
 * carrying an `error`, never as a thrown exception — that is what buys the
 * model a turn to fix itself instead of failing the run.
 */
async function dispatchCheck() {
  const registry = new ToolRegistry<SmokeContext>([readCell, revealSwatch, submitReport]);
  const ctx: SmokeContext = { reads: [] };

  const outOfRange = await registry.dispatch(
    { name: "read_cell", args: { row: 9, col: 0 } },
    ctx,
  );
  const missingArg = await registry.dispatch({ name: "read_cell", args: { row: 1 } }, ctx);
  const unknown = await registry.dispatch({ name: "nope", args: {} }, ctx);
  const valid = await registry.dispatch({ name: "read_cell", args: { row: 1, col: 1 } }, ctx);

  const errorOf = (outcome: { part: { functionResponse?: { response?: Record<string, unknown> } } }) =>
    outcome.part.functionResponse?.response?.error;

  // A JSON Schema Gemini will actually accept: no $schema, and an object at the root.
  const schema = registry.declarations().find((d) => d.name === "read_cell");

  return {
    ok:
      errorOf(outOfRange) === "invalid_arguments" &&
      errorOf(missingArg) === "invalid_arguments" &&
      errorOf(unknown) === "unknown_tool" &&
      valid.ok &&
      ctx.reads.length === 1 &&
      schema?.parametersJsonSchema !== undefined &&
      !("$schema" in (schema.parametersJsonSchema as Record<string, unknown>)),
    outOfRange: outOfRange.part.functionResponse?.response,
    unknown: unknown.part.functionResponse?.response,
    handlerRanOnlyForValidCall: ctx.reads.length === 1,
    readCellSchema: schema?.parametersJsonSchema,
  };
}

// ---------------------------------------------------------------- check 4

/**
 * The persistence path, on a throwaway exam that is deleted again. Traces are
 * written best-effort and swallow their own errors by design, so a broken
 * insert would otherwise stay silent until Phase 4 needed to debug a bad
 * extraction and found an empty table.
 */
async function tracePersistenceCheck() {
  const supabase = createServerSupabase();
  const blank = { name: "smoke", sizeBytes: 0, pages: [] };

  const { data: exam, error: insertError } = await supabase
    .from("exams")
    .insert({ question_paper: blank, answer_sheet: blank })
    .select("id")
    .single();

  if (insertError || !exam) {
    return { ok: false, error: insertError?.message ?? "no exam row" };
  }

  try {
    // batchSize 2 so the buffer flushes mid-run as well as at the end.
    const tracer = createDbTracer(supabase, exam.id, "questions", { batchSize: 2 });
    tracer.emit(0, { kind: "request", historyLength: 1, parts: [{ text: "hello" }] });
    tracer.emit(0, {
      kind: "tool",
      name: "read_cell",
      ok: true,
      durationMs: 1,
      args: { row: 0 },
      output: { value: 4 },
    });
    tracer.emit(1, {
      kind: "finished",
      status: "done",
      turns: 2,
      usage: { promptTokens: 1, outputTokens: 2, totalTokens: 3 },
    });
    await tracer.flush();

    const { data: rows, error: readError } = await supabase
      .from("agent_traces")
      .select("turn, agent, payload")
      .eq("exam_id", exam.id)
      .order("id");

    // A ~400KB page image must never reach a trace row.
    const big = "A".repeat(400_000);
    const redacted = redactParts([
      { inlineData: { mimeType: "image/webp", data: big } },
      { text: "kept" },
    ]);
    const blobRedacted = JSON.stringify(redacted).length < 200;

    return {
      ok: !readError && rows?.length === 3 && blobRedacted,
      rowsWritten: rows?.length ?? 0,
      error: readError?.message,
      blobRedacted,
      sampleRedaction: redacted[0],
    };
  } finally {
    // Cascade removes the trace rows with it.
    await supabase.from("exams").delete().eq("id", exam.id);
  }
}

// ---------------------------------------------------------------- route

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const limiter = await limiterCheck();
  const dispatch = await dispatchCheck();
  const trace = await tracePersistenceCheck();

  let agent: Awaited<ReturnType<typeof agentCheck>> | { ok: false; error: string };
  try {
    agent = await agentCheck(request.signal);
  } catch (error) {
    agent = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  const ok = limiter.ok && dispatch.ok && trace.ok && agent.ok;
  return NextResponse.json(
    { ok, model: GEMINI_MODEL, limiter, dispatch, trace, agent },
    { status: ok ? 200 : 500 },
  );
}

// ------------------------------------------------------- minimal PNG writer

/**
 * Encodes a 96x96 solid colour as a PNG. Small enough to be worth writing by
 * hand, and it means the attachment path is proven with a real image the model
 * has to actually look at rather than a placeholder byte string.
 */
function solidPng([r, g, b]: [number, number, number], size = 96): Buffer {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 3 + 1);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < size; x += 1) {
      const px = rowStart + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  // bytes 10-12 stay zero: deflate compression, adaptive filtering, no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
