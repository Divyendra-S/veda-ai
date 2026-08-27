/**
 * Environment access.
 *
 * Validated lazily rather than at module load: the app must still boot (and
 * render a useful error) when a key is missing, instead of the whole route
 * tree failing to import.
 *
 * Uses Supabase's current API key system — a publishable key (sb_publishable_…)
 * in place of the legacy anon key, and a secret key (sb_secret_…) in place of
 * service_role.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const serverEnv = {
  get geminiApiKey() {
    return required("GEMINI_API_KEY", process.env.GEMINI_API_KEY);
  },
  /** Bypasses row-level security. Server-side only, never sent to the browser. */
  get supabaseSecretKey() {
    return required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);
  },
};

// NEXT_PUBLIC_* must be referenced as full literals so the Next.js compiler can
// inline them into the client bundle. Destructuring process.env breaks this.
export const publicEnv = {
  get supabaseUrl() {
    return required(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
  },
  get supabasePublishableKey() {
    return required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
  },
};

/** Reports which variables are set, without leaking their values. */
export function envStatus() {
  return {
    GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY),
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    SUPABASE_SECRET_KEY: Boolean(process.env.SUPABASE_SECRET_KEY),
  };
}
