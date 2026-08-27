import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env";

/**
 * Server client using the service-role key. Bypasses row-level security, so it
 * must never be constructed in code that reaches the browser — the
 * "server-only" import above turns that mistake into a build error.
 */
export function createServerSupabase() {
  return createClient(publicEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
}
