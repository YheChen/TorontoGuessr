import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase-client";

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

/** False when the project is not configured, so callers keep fast polling. */
export const isLobbyRealtimeConfigured = isSupabaseConfigured;

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
  const supabase = getSupabaseClient();
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
