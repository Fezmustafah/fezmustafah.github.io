// supabase.js — cloud client. Null-safe: if env vars are absent the app runs
// fully local (IndexedDB) with no cloud features. The anon key is publishable
// (safe in the browser); Row Level Security enforces per-user isolation.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =
  url && anon
    ? createClient(url, anon, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true, // parse the OAuth redirect (?code / #access_token)
          flowType: "pkce",
        },
      })
    : null;
export const cloudEnabled = !!supabase;
