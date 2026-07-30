import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Push notifications for lobby changes.
 *
 * The backend broadcasts a contentless "changed" event whenever a lobby moves;
 * this subscribes and asks the caller to refetch. No game state travels over
 * the socket, so a listener learns nothing they could not get by polling, and
 * the lobby tables stay unreadable to this key (row level security is deny-all
 * for anon). Polling remains the fallback, so losing the socket costs latency
 * rather than correctness.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** False when the project is not configured, so callers keep fast polling. */
export const isLobbyRealtimeConfigured = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY
);

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      // A lobby only needs change nudges; cap the rate so a burst of
      // broadcasts cannot spin the client.
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }
  return client;
}

export function lobbyChannelName(joinCode: string): string {
  return `lobby:${joinCode.toUpperCase()}`;
}

export interface LobbySubscription {
  unsubscribe: () => void;
}

/**
 * Listen for changes to one lobby.
 *
 * `onChange` may fire in bursts (a guess that completes a round both records
 * the guess and reveals), so callers should debounce their refetch.
 * `onStatusChange` reports whether the socket is live, letting the caller slow
 * its polling while connected and speed it back up if the socket drops.
 */
export function subscribeToLobby(
  joinCode: string,
  onChange: () => void,
  onStatusChange?: (connected: boolean) => void
): LobbySubscription | null {
  const supabase = getClient();
  if (!supabase) {
    return null;
  }

  const channel = supabase.channel(lobbyChannelName(joinCode), {
    config: { broadcast: { self: false } },
  });

  channel.on("broadcast", { event: "changed" }, () => onChange());
  channel.subscribe((status) => {
    onStatusChange?.(status === "SUBSCRIBED");
  });

  return {
    unsubscribe: () => {
      void supabase.removeChannel(channel);
    },
  };
}
