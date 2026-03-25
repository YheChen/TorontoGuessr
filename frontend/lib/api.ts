import type {
  GuessLocation,
  GuessResponse,
  LeaderboardEntry,
  NextRoundResponse,
  StartGameResponse,
  SummaryResponse,
} from "@/lib/types";

const rawApiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:3001/api" : undefined);

if (!rawApiBaseUrl) {
  throw new Error("NEXT_PUBLIC_API_BASE_URL is required outside development.");
}

const API_BASE_URL = rawApiBaseUrl.endsWith("/")
  ? rawApiBaseUrl.slice(0, -1)
  : rawApiBaseUrl;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
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

export function startGame() {
  return request<StartGameResponse>("/games/start", {
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

export async function fetchLeaderboard() {
  const response = await request<{ entries: LeaderboardEntry[] }>("/leaderboard");
  return response.entries;
}
