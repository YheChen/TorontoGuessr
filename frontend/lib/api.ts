import { getSession, refreshSession } from "@/lib/auth-client";
import { getClientId } from "@/lib/daily-attempt";

import type {
  CreateChallengeResponse,
  CreateLobbyResponse,
  DeleteRejectedLocationsResponse,
  GameHistoryResponse,
  GameMode,
  GameStatsResponse,
  GuessLocation,
  GuessResponse,
  JoinLobbyResponse,
  LeaderboardPeriod,
  LeaderboardResponse,
  LobbyState,
  Profile,
  LocationReviewQueueResponse,
  NextRoundResponse,
  SaveScoreResponse,
  StartGameResponse,
  SummaryResponse,
  UpdateLocationReviewResponse,
} from "@/lib/types";

const rawApiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:3001/api" : undefined);

function getApiBaseUrl() {
  if (!rawApiBaseUrl) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is required outside development.");
  }

  return rawApiBaseUrl.endsWith("/")
    ? rawApiBaseUrl.slice(0, -1)
    : rawApiBaseUrl;
}

async function send(
  path: string,
  init: RequestInit | undefined,
  accessToken: string | null
): Promise<Response> {
  return fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

async function request<T>(
  path: string,
  init?: RequestInit,
  { authenticated = false }: { authenticated?: boolean } = {}
): Promise<T> {
  // Only authenticated calls pay the cost of reading the session.
  let accessToken = authenticated ? (await getSession())?.accessToken ?? null : null;
  let response = await send(path, init, accessToken);

  // A token can expire mid-session. The backend answers 401 rather than
  // silently treating the request as anonymous, so refresh once and retry
  // instead of surfacing a spurious error.
  if (response.status === 401 && accessToken) {
    const refreshed = await refreshSession();
    if (refreshed?.accessToken && refreshed.accessToken !== accessToken) {
      accessToken = refreshed.accessToken;
      response = await send(path, init, accessToken);
    }
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof body?.error === "string"
        ? body.error
        : `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return body as T;
}

export function startGame(
  mode: GameMode = "classic",
  challengeCode?: string | null
) {
  // The browser's own id, and only for the daily: it is what lets the server
  // notice a second attempt at the same day's challenge. Sent for the daily alone
  // rather than on every start, so nothing else is ever keyed by it.
  const clientId = mode === "daily" ? getClientId() : null;
  return request<StartGameResponse>(
    "/games/start",
    {
      method: "POST",
      headers: clientId ? { "x-client-id": clientId } : {},
      body: JSON.stringify(
        mode === "challenge" ? { mode, challengeCode } : { mode }
      ),
    },
    // Authenticated so a signed-in player is keyed by their ACCOUNT rather than
    // their browser, which they cannot escape by clearing storage.
    { authenticated: mode === "daily" }
  );
}

/**
 * The play token for a game, as a header.
 *
 * A header rather than a query parameter so the credential never lands in a URL,
 * a referrer, or an access log. Omitted entirely when there is no token, which is
 * what a game started against an older backend looks like; the backend
 * grandfathers those instead of refusing them.
 */
function getPlayHeaders(
  playToken: string | null | undefined
): Record<string, string> {
  return playToken ? { "x-play-token": playToken } : {};
}

/** Snapshot this game's rounds behind a shareable code. */
export function createChallenge(
  sessionId: string,
  playToken?: string | null
) {
  return request<CreateChallengeResponse>(`/games/${sessionId}/challenge`, {
    method: "POST",
    headers: getPlayHeaders(playToken),
  });
}

/**
 * Sends the token when there is one, so the guess that finishes a game can be
 * filed under the player's account. A guest sends no header and is unaffected;
 * the backend uses optionalUser and never requires one.
 *
 * Attribution has to happen here rather than on the username route, because the
 * leaderboard publishes session ids, so anything keyed only on a session id
 * would let a signed-in player claim a stranger's finished game.
 */
export function submitGuess(
  sessionId: string,
  guessLocation: GuessLocation | null,
  playToken?: string | null
) {
  return request<GuessResponse>(
    `/games/${sessionId}/guess`,
    {
      method: "POST",
      headers: getPlayHeaders(playToken),
      body: JSON.stringify({ guessLocation }),
    },
    { authenticated: true }
  );
}

export function fetchNextRound(sessionId: string, playToken?: string | null) {
  return request<NextRoundResponse | SummaryResponse>(`/games/${sessionId}/next`, {
    method: "POST",
    headers: getPlayHeaders(playToken),
  });
}

export function saveScoreUsername(
  sessionId: string,
  username: string,
  playToken?: string | null
) {
  return request<SaveScoreResponse>(`/games/${sessionId}/username`, {
    method: "POST",
    headers: getPlayHeaders(playToken),
    body: JSON.stringify({ username }),
  });
}

export async function fetchLeaderboard(
  period: LeaderboardPeriod = "lifetime",
  {
    page = 1,
    limit = 10,
    board = "global",
  }: { page?: number; limit?: number; board?: "global" | "challenge" } = {}
) {
  const response = await request<LeaderboardResponse>(
    `/leaderboard?period=${encodeURIComponent(period)}&board=${board}&page=${page}&limit=${limit}`
  );
  return response;
}

/**
 * Lobby routes authenticate the player with a header rather than a query
 * parameter, so the token never lands in a URL.
 */
function getPlayerHeaders(playerToken: string) {
  return { "x-player-token": playerToken };
}

export function createLobby(displayName: string) {
  return request<CreateLobbyResponse>("/lobbies", {
    method: "POST",
    body: JSON.stringify({ displayName }),
  });
}

export function joinLobby(joinCode: string, displayName: string) {
  return request<JoinLobbyResponse>(
    `/lobbies/${encodeURIComponent(joinCode)}/join`,
    {
      method: "POST",
      body: JSON.stringify({ displayName }),
    }
  );
}

export function fetchLobbyState(joinCode: string, playerToken?: string | null) {
  return request<LobbyState>(`/lobbies/${encodeURIComponent(joinCode)}/state`, {
    headers: playerToken ? getPlayerHeaders(playerToken) : {},
    cache: "no-store",
  });
}

export function startLobby(joinCode: string, playerToken: string) {
  return request<LobbyState>(`/lobbies/${encodeURIComponent(joinCode)}/start`, {
    method: "POST",
    headers: getPlayerHeaders(playerToken),
  });
}

export function submitLobbyGuess(
  joinCode: string,
  playerToken: string,
  guessLocation: GuessLocation | null
) {
  return request<LobbyState>(`/lobbies/${encodeURIComponent(joinCode)}/guess`, {
    method: "POST",
    headers: getPlayerHeaders(playerToken),
    body: JSON.stringify({ guessLocation }),
  });
}

export function advanceLobby(joinCode: string, playerToken: string) {
  return request<LobbyState>(`/lobbies/${encodeURIComponent(joinCode)}/next`, {
    method: "POST",
    headers: getPlayerHeaders(playerToken),
  });
}

/**
 * Start another game with the players already in the lobby.
 *
 * Host only, and only once the lobby has finished. The join code and every
 * player's seat survive, so nobody re-joins; scores reset.
 */
export function rematchLobby(joinCode: string, playerToken: string) {
  return request<LobbyState>(`/lobbies/${encodeURIComponent(joinCode)}/rematch`, {
    method: "POST",
    headers: getPlayerHeaders(playerToken),
  });
}

export function leaveLobby(joinCode: string, playerToken: string) {
  return request<{ left: boolean }>(
    `/lobbies/${encodeURIComponent(joinCode)}/leave`,
    {
      method: "POST",
      headers: getPlayerHeaders(playerToken),
    }
  );
}

export function fetchProfile() {
  return request<{ profile: Profile }>("/me", undefined, { authenticated: true });
}

export function updateDisplayName(displayName: string) {
  return request<{ profile: Profile }>(
    "/me",
    { method: "PATCH", body: JSON.stringify({ displayName }) },
    { authenticated: true }
  );
}

/** This account's finished games, newest first. */
export function fetchGameHistory({
  page = 1,
  limit = 20,
}: { page?: number; limit?: number } = {}) {
  return request<GameHistoryResponse>(
    `/me/games?page=${page}&limit=${limit}`,
    { cache: "no-store" },
    { authenticated: true }
  );
}

/**
 * Carry a streak earned before the account existed onto the account.
 *
 * Only ever raises the stored best. The current streak stays derived from played
 * games on the server, so this cannot be used to claim one.
 */
export function importStreakBest(bestStreak: number) {
  return request<{ profile: Profile }>(
    "/me/streak",
    { method: "POST", body: JSON.stringify({ bestStreak }) },
    { authenticated: true }
  );
}

function getAdminHeaders(adminToken: string) {
  return {
    "x-admin-token": adminToken,
  };
}

export function fetchLocationReviewQueue(
  index: number,
  adminToken: string,
  locationId?: string
) {
  const searchParams = new URLSearchParams({
    index: String(index),
  });
  if (locationId) {
    searchParams.set("locationId", locationId);
  }

  return request<LocationReviewQueueResponse>(
    `/admin/review-locations?${searchParams.toString()}`,
    {
      headers: getAdminHeaders(adminToken),
    }
  );
}

export function updateLocationReviewStatus(
  locationId: string,
  action: "accept" | "reject" | "undo",
  adminToken: string
) {
  return request<UpdateLocationReviewResponse>(
    `/admin/review-locations/${locationId}`,
    {
      method: "PATCH",
      headers: getAdminHeaders(adminToken),
      body: JSON.stringify({ action }),
    }
  );
}

export function deleteRejectedLocations(adminToken: string) {
  return request<DeleteRejectedLocationsResponse>(
    "/admin/review-locations/rejected",
    {
      method: "DELETE",
      headers: getAdminHeaders(adminToken),
    }
  );
}

export function fetchGameStats(days = 30) {
  return request<GameStatsResponse>(`/stats/games?days=${days}`);
}
