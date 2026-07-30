import type {
  CreateChallengeResponse,
  CreateLobbyResponse,
  DeleteRejectedLocationsResponse,
  GameMode,
  GameStatsResponse,
  GuessLocation,
  GuessResponse,
  JoinLobbyResponse,
  LeaderboardPeriod,
  LeaderboardResponse,
  LobbyState,
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

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
  return request<StartGameResponse>("/games/start", {
    method: "POST",
    body: JSON.stringify(
      mode === "challenge" ? { mode, challengeCode } : { mode }
    ),
  });
}

/** Snapshot this game's rounds behind a shareable code. */
export function createChallenge(sessionId: string) {
  return request<CreateChallengeResponse>(`/games/${sessionId}/challenge`, {
    method: "POST",
  });
}

export function submitGuess(sessionId: string, guessLocation: GuessLocation | null) {
  return request<GuessResponse>(`/games/${sessionId}/guess`, {
    method: "POST",
    body: JSON.stringify({ guessLocation }),
  });
}

export function fetchNextRound(sessionId: string) {
  return request<NextRoundResponse | SummaryResponse>(`/games/${sessionId}/next`, {
    method: "POST",
  });
}

export function saveScoreUsername(sessionId: string, username: string) {
  return request<SaveScoreResponse>(`/games/${sessionId}/username`, {
    method: "POST",
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

export function leaveLobby(joinCode: string, playerToken: string) {
  return request<{ left: boolean }>(
    `/lobbies/${encodeURIComponent(joinCode)}/leave`,
    {
      method: "POST",
      headers: getPlayerHeaders(playerToken),
    }
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
