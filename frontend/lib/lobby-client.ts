import type { LobbyPlayerState } from "@/lib/types";

/**
 * Per-lobby player credentials, kept so a refresh does not lose your seat.
 * Scoped by join code so being in one lobby never clobbers another.
 */
const TOKEN_PREFIX = "tg_lobby_token_";

export function lobbyTokenKey(joinCode: string): string {
  return `${TOKEN_PREFIX}${joinCode.toUpperCase()}`;
}

export function readLobbyToken(joinCode: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(lobbyTokenKey(joinCode));
  } catch {
    // Private browsing or blocked storage: treat as no saved seat.
    return null;
  }
}

export function writeLobbyToken(joinCode: string, token: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(lobbyTokenKey(joinCode), token);
  } catch {
    // Not fatal: the player just loses their seat on refresh.
  }
}

export function clearLobbyToken(joinCode: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(lobbyTokenKey(joinCode));
  } catch {
    // Nothing to do.
  }
}

/**
 * Stable per-player colours so the map pins and the scoreboard always agree.
 * Assigned by position in the player list, which the backend orders by join
 * time, so a colour does not change mid-game.
 */
export const LOBBY_PLAYER_COLORS = [
  "#e11d48",
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#9333ea",
  "#0891b2",
  "#db2777",
  "#65a30d",
] as const;

export function playerColor(index: number): string {
  const palette = LOBBY_PLAYER_COLORS;
  const safeIndex = ((index % palette.length) + palette.length) % palette.length;
  return palette[safeIndex] ?? palette[0];
}

/** Seconds left until an ISO deadline, using the server clock as the base. */
export function secondsUntil(
  deadlineIso: string | null,
  serverTimeIso: string,
  elapsedMsSinceFetch = 0
): number {
  if (!deadlineIso) {
    return 0;
  }
  const deadline = Date.parse(deadlineIso);
  const serverNow = Date.parse(serverTimeIso);
  if (Number.isNaN(deadline) || Number.isNaN(serverNow)) {
    return 0;
  }
  const remainingMs = deadline - serverNow - elapsedMsSinceFetch;
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

/** Players ranked for a scoreboard: score first, then name for stability. */
export function rankPlayers(players: LobbyPlayerState[]): LobbyPlayerState[] {
  return [...players].sort(
    (a, b) =>
      b.totalScore - a.totalScore || a.displayName.localeCompare(b.displayName)
  );
}

/** "3 / 4 guessed" style progress for the guessing phase. */
export function guessProgress(players: LobbyPlayerState[]): {
  guessed: number;
  total: number;
} {
  const active = players.filter((player) => player.isConnected);
  const pool = active.length > 0 ? active : players;
  return {
    guessed: pool.filter((player) => player.hasGuessed).length,
    total: pool.length,
  };
}
