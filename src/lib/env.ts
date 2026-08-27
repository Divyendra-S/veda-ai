/**
 * Environment access.
 *
 * Validated lazily rather than at module load: the app must still boot (and
 * render a useful error) when a key is missing, instead of the whole route
 * tree failing to import.
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
  get supabaseServiceRoleKey() {
    return required(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
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
  get supabaseAnonKey() {
    return required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  },
};

/** Reports which variables are set, without leaking their values. */
export function envStatus() {
  return {
    GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY),
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}
