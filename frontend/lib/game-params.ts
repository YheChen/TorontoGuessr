import type { GameMode } from "@/lib/types";

export interface GameParams {
  mode: GameMode;
  /** Present only for challenge mode. */
  challengeCode: string | null;
}

/**
 * Which game the URL is asking for. Pure so it can be unit tested.
 *
 * `?mode=daily` starts the daily challenge; `?mode=challenge&c=CODE` replays a
 * shared challenge. A challenge mode without a code is not playable, so it
 * falls back to classic rather than starting a game that cannot resolve.
 * The backend still normalizes and validates the code.
 */
export function parseGameParams(search: string): GameParams {
  const params = new URLSearchParams(search);
  const mode = params.get("mode");

  if (mode === "daily") {
    return { mode: "daily", challengeCode: null };
  }

  if (mode === "challenge") {
    const code = params.get("c")?.trim();
    if (code) {
      return { mode: "challenge", challengeCode: code };
    }
  }

  return { mode: "classic", challengeCode: null };
}

/** The link that replays a challenge, for sharing. */
export function buildChallengeUrl(origin: string, code: string): string {
  const base = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${base}/game?mode=challenge&c=${encodeURIComponent(code)}`;
}
