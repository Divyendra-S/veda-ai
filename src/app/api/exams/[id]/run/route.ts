import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { advanceExam, ExamNotFound } from "@/lib/exam/pipeline";

export const dynamic = "force-dynamic";

/** Vercel's ceiling on a Pro function. The pipeline stops itself well before
 *  this and reports `done: false` so the client can call again. */
export const maxDuration = 300;

/** Leaves the invocation room to persist and respond before the platform cuts
 *  it off mid-write. */
const RESERVE_MS = 45_000;

/**
 * Advances the pipeline one invocation's worth. Returning `{ done: false }`
 * is a normal outcome, not an error: the client immediately calls again and
 * the run picks up at the step it left off.
 *
 * `?retry=1` is the one way an exam that has already failed starts moving
 * again. It is a query flag rather than the default because a failed run must
 * stay failed for every poll that follows it — otherwise the client's own
 * retry loop would restart a hopeless extraction on its own and burn quota
 * doing it.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/exams/[id]/run">,
) {
  const { id } = await ctx.params;
  const retry = request.nextUrl.searchParams.get("retry") === "1";

  try {
    const result = await advanceExam(id, {
      deadline: Date.now() + (maxDuration * 1000 - RESERVE_MS),
      signal: request.signal,
      retry,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ExamNotFound) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      {
        error: "Could not advance the exam.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
