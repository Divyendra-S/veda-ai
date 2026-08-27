import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Server client using the secret key, which carries BYPASSRLS and skips every
 * policy — so it must never reach the browser. The "server-only" import above
 * turns that mistake into a build error rather than a runtime leak.
 *
 * Deliberately NOT @supabase/ssr's createServerClient: that exists to read and
 * refresh a user's session out of cookies, and this app has no authentication.
 * There is no session to carry, so the cookie plumbing would be dead code.
 */
export function createServerSupabase() {
  return createClient<Database>(publicEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
    auth: { persistSession: false },
  });
}
