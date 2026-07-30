import { loadEnv } from "./env.js";

loadEnv();

/**
 * Lobby change notifications over Supabase Realtime broadcast.
 *
 * Why broadcast and not Postgres Changes: Postgres Changes respects row level
 * security, so subscribers would need a SELECT policy on `lobbies` to receive
 * anything, and that policy would expose the answer coordinates in
 * `lobbies.rounds` to every client. Broadcast never touches tables, so those
 * tables stay deny-all for the anon key.
 *
 * The message carries no game state, only "something changed". Clients refetch
 * through the API, which is where the reveal boundary is enforced. A listener
 * who guessed a lobby code therefore learns nothing they could not already get
 * by polling.
 *
 * Delivery is best effort: clients also poll, so a dropped notification costs
 * latency, never correctness.
 */

const BROADCAST_TIMEOUT_MS = 1500;

let hasWarnedAboutFailure = false;

function getConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

/** Channel a lobby's clients listen on. */
export function lobbyChannel(joinCode: string): string {
  return `lobby:${joinCode.toUpperCase()}`;
}

/**
 * Tell a lobby's clients to refetch.
 *
 * Awaited rather than fired and forgotten because a serverless function can be
 * frozen the moment it responds, which would drop the request. The POST is a
 * single call to the same region, so the added latency is small next to the
 * database work the caller has already done.
 */
export async function broadcastLobbyChange(
  joinCode: string,
  reason: string
): Promise<void> {
  const config = getConfig();
  if (!config) {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BROADCAST_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: lobbyChannel(joinCode),
            event: "changed",
            // Deliberately contentless: a reason for debugging, no game state.
            payload: { reason },
            private: false,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok && !hasWarnedAboutFailure) {
      hasWarnedAboutFailure = true;
      console.warn(
        `[realtime] lobby broadcast rejected (${response.status}); clients will fall back to polling.`
      );
    }
  } catch (error) {
    if (!hasWarnedAboutFailure) {
      hasWarnedAboutFailure = true;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[realtime] lobby broadcast failed (${message}); clients will fall back to polling.`
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}
