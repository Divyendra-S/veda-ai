import { NextResponse } from "next/server";
import { envStatus } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Reports whether the app can reach Supabase and Gemini. Never returns key values. */
export async function GET() {
  const env = envStatus();
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SECRET_KEY) {
    try {
      const supabase = createServerSupabase();
      const { error } = await supabase.storage.listBuckets();
      checks.supabase = error
        ? { ok: false, detail: error.message }
        : { ok: true };
    } catch (e) {
      checks.supabase = { ok: false, detail: (e as Error).message };
    }
  } else {
    checks.supabase = { ok: false, detail: "env not configured" };
  }

  if (env.GEMINI_API_KEY) {
    try {
      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models",
        { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY! } },
      );
      checks.gemini = res.ok
        ? { ok: true }
        : { ok: false, detail: `HTTP ${res.status}` };
    } catch (e) {
      checks.gemini = { ok: false, detail: (e as Error).message };
    }
  } else {
    checks.gemini = { ok: false, detail: "env not configured" };
  }

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok, env, checks }, { status: ok ? 200 : 503 });
}
