import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The single browser Supabase client.
 *
 * One instance matters: auth state and the Realtime socket must share it, or a
 * sign-in would not be visible to the connection already open. Sessions are
 * persisted so a reload does not silently drop an account.
 *
 * This client is only ever used for identity and for Realtime change nudges.
 * All application data goes through the backend API, because the lobby and
 * challenge tables hold answer coordinates and are RLS-deny-all by design.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** False when the project is not configured, so callers can degrade quietly. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }
  if (typeof window === "undefined") {
    // Sessions live in browser storage; there is nothing to build server side.
    return null;
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      // A lobby only needs change nudges; cap the rate so a burst of
      // broadcasts cannot spin the client.
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }
  return client;
}
