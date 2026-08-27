/**
 * Tool registry.
 *
 * One Zod schema per tool is the single source of truth: it generates the
 * declaration Gemini sees, and it validates what Gemini sends back. Writing the
 * schema twice — once as an OpenAPI blob for the model, once as a validator —
 * is how tool arguments silently drift from what the handler expects.
 *
 * A handler returns three things, and each exists for a reason:
 *
 *   output      the JSON the model gets back as a functionResponse
 *   attachments extra parts appended as a *separate* user turn. Page images go
 *               here: a functionResponse is JSON-only, so a `read_page` tool
 *               acknowledges in `output` and hands the actual bitmap over in
 *               `attachments`
 *   done        set by a terminal tool; ends the run and becomes its result
 */

import { z } from "zod";
import type { FunctionCall, FunctionDeclaration, Part } from "@google/genai";

export type ToolResult = {
  output: Record<string, unknown>;
  attachments?: Part[];
  done?: unknown;
};

export type ToolHandler<TCtx, TInput> = (
  input: TInput,
  ctx: TCtx,
) => Promise<ToolResult> | ToolResult;

export type ToolDefinition<TCtx> = {
  name: string;
  description: string;
  input: z.ZodType;
  handler: ToolHandler<TCtx, never>;
};

/**
 * Binds a context type once, then infers each tool's argument type from its own
 * schema.
 *
 * Curried because TypeScript's type arguments are all-or-nothing: writing
 * `defineTool<Ctx, Schema>(...)` would force the schema to be spelled out a
 * second time, which is exactly the duplication the registry exists to avoid.
 * With the context fixed by the factory, `handler`'s argument is inferred from
 * `input`, so a renamed field is a build error rather than an `undefined` at
 * runtime.
 *
 *     const tool = defineToolsFor<MyContext>();
 *     const readPage = tool({ name, description, input: z.object({…}), handler });
 */
export function defineToolsFor<TCtx>() {
  return function defineTool<TSchema extends z.ZodType>(def: {
    name: string;
    description: string;
    input: TSchema;
    handler: ToolHandler<TCtx, z.output<TSchema>>;
  }): ToolDefinition<TCtx> {
    return def as unknown as ToolDefinition<TCtx>;
  };
}

/**
 * Gemini accepts either its own OpenAPI-flavoured `parameters` or plain JSON
 * Schema via `parametersJsonSchema`. The latter lets Zod emit the schema
 * directly. `$schema` is stripped because the API rejects unknown top-level
 * keywords.
 */
export function toParametersJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, {
    io: "input",
    // A tool argument the model cannot express is a bug in the tool, not
    // something to silently drop.
    unrepresentable: "throw",
  }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export function toFunctionDeclaration<TCtx>(
  tool: ToolDefinition<TCtx>,
): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: toParametersJsonSchema(tool.input),
  };
}

export type DispatchOutcome = {
  /** The functionResponse part to send back to the model. */
  part: Part;
  attachments?: Part[];
  done?: unknown;
  ok: boolean;
  error?: string;
  durationMs: number;
};

export class ToolRegistry<TCtx> {
  private readonly tools = new Map<string, ToolDefinition<TCtx>>();

  constructor(tools: ToolDefinition<TCtx>[]) {
    for (const tool of tools) {
      if (this.tools.has(tool.name)) {
        throw new Error(`Duplicate tool name: ${tool.name}`);
      }
      this.tools.set(tool.name, tool);
    }
  }

  get names(): string[] {
    return [...this.tools.keys()];
  }

  declarations(): FunctionDeclaration[] {
    return [...this.tools.values()].map(toFunctionDeclaration);
  }

  /**
   * Runs one call. Never throws for a *model* mistake — an unknown tool, bad
   * arguments, or a handler failure all come back as a functionResponse
   * carrying an `error`, which gives the model a turn to repair itself. Only an
   * abort propagates, because that is our decision, not the model's.
   */
  async dispatch(
    call: FunctionCall,
    ctx: TCtx,
    options: { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<DispatchOutcome> {
    const startedAt = Date.now();
    const name = call.name ?? "";
    const respond = (
      payload: Record<string, unknown>,
      extra: Partial<DispatchOutcome> = {},
    ): DispatchOutcome => ({
      part: {
        functionResponse: { id: call.id, name, response: payload },
      },
      ok: true,
      durationMs: Date.now() - startedAt,
      ...extra,
    });

    const tool = this.tools.get(name);
    if (!tool) {
      return respond(
        {
          error: "unknown_tool",
          message: `No tool named "${name}". Available tools: ${this.names.join(", ")}.`,
        },
        { ok: false, error: "unknown_tool" },
      );
    }

    const parsed = tool.input.safeParse(call.args ?? {});
    if (!parsed.success) {
      return respond(
        {
          error: "invalid_arguments",
          message: `Arguments for "${name}" did not validate. Fix them and call the tool again.`,
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { ok: false, error: "invalid_arguments" },
      );
    }

    try {
      const result = await withTimeout(
        Promise.resolve(
          (tool.handler as ToolHandler<TCtx, unknown>)(parsed.data, ctx),
        ),
        options.timeoutMs,
        name,
      );
      return respond(result.output, {
        attachments: result.attachments,
        done: result.done,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      const message = error instanceof Error ? error.message : String(error);
      return respond(
        { error: "tool_failed", message },
        { ok: false, error: message },
      );
    }
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number | undefined,
  name: string,
): Promise<T> {
  if (!timeoutMs) return promise;
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Tool "${name}" timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}
