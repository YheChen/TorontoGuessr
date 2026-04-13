export interface GuessLocation {
  lat: number;
  lng: number;
}

export interface RoundPayload {
  panoId: string;
  heading: number;
  pitch: number;
  zoom: number;
}

export interface StartGameResponse {
  sessionId: string;
  currentRound: number;
  totalRounds: number;
  round: RoundPayload;
  timeLimit: number;
}

export interface GuessResponse {
  roundNumber: number;
  score: number;
  distance: number | null;
  guessLocation: GuessLocation | null;
  actualLocation: GuessLocation;
  totalScore: number;
  gameFinished: boolean;
  isLastRound: boolean;
}

export interface NextRoundResponse {
  currentRound: number;
  totalRounds: number;
  round: RoundPayload;
  timeLimit: number;
}

export interface SummaryResponse {
  gameFinished: true;
  summary: {
    username: string;
    totalScore: number;
    rounds: GuessResponse[];
  };
}

export type LeaderboardPeriod = "lifetime" | "daily" | "weekly" | "monthly";

export interface SaveScoreResponse {
  saved: {
    id: string;
    username: string;
  };
}

export interface LeaderboardEntry {
  id: string;
  username: string;
  totalScore: number;
  roundsPlayed: number;
  completedAt: string;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}
