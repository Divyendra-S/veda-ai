import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/** Browser client. Anon key only — used for uploading page images to Storage. */
export function createBrowserSupabase() {
  return createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: false },
  });
}
