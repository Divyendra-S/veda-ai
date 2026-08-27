import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";
import { publicEnv } from "@/lib/env";

/**
 * Browser client. Publishable key only — row-level security gates every query,
 * so this is safe to ship in the client bundle.
 *
 * Used for uploading rasterized page images straight to Storage, which keeps
 * multi-megabyte payloads out of our serverless functions entirely.
 */
export function createBrowserSupabase() {
  return createBrowserClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
  );
}
