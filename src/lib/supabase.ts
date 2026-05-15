import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Surfaced early so misconfigured deploys fail loudly. The smoke test in
  // App.tsx renders a user-friendly message for end users; this log helps
  // when reading Vercel build logs / browser devtools.
  // eslint-disable-next-line no-console
  console.error(
    "[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
    "Set these in Vercel → Project → Settings → Environment Variables."
  );
}

export const supabase = createClient(
  SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY ?? "",
  {
    auth: { persistSession: false },
  }
);

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
