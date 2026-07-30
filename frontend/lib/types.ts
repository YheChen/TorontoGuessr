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

export type GameMode = "classic" | "daily" | "challenge";

export interface StartGameResponse {
  sessionId: string;
  username: string;
  currentRound: number;
  totalRounds: number;
  round: RoundPayload;
  timeLimit: number;
  /** Present on newer backends. */
  mode?: GameMode;
  challengeDate?: string | null;
  /** The shared challenge this game is replaying, when mode is "challenge". */
  challengeCode?: string | null;
}

export interface CreateChallengeResponse {
  code: string;
  totalRounds: number;
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
  /** Prefetched next round, present on newer backends when the game continues. */
  nextRound?: NextRoundResponse | null;
  /** True when a placed guess was discarded for missing the round deadline. */
  guessRejectedLate?: boolean;
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

export type LobbyStatus = "waiting" | "in_progress" | "finished";

export interface LobbyPlayerState {
  playerId: string;
  displayName: string;
  totalScore: number;
  isConnected: boolean;
  /** Who has locked in a guess. Never says where, until the reveal. */
  hasGuessed: boolean;
  /** Present only once the round is revealed. */
  roundScore?: number;
  roundDistance?: number | null;
  guessLocation?: GuessLocation | null;
}

export interface LobbyState {
  joinCode: string;
  status: LobbyStatus;
  hostPlayerId: string;
  currentRound: number;
  totalRounds: number;
  roundRevealed: boolean;
  timeLimit: number;
  roundDeadlineAt: string | null;
  revealDeadlineAt: string | null;
  /** Lets the client run a countdown without trusting its own clock. */
  serverTime: string;
  round: RoundPayload | null;
  actualLocation: GuessLocation | null;
  you: {
    playerId: string;
    isHost: boolean;
    hasGuessed: boolean;
  } | null;
  players: LobbyPlayerState[];
}

export interface CreateLobbyResponse {
  joinCode: string;
  playerId: string;
  playerToken: string;
}

export interface JoinLobbyResponse {
  playerId: string;
  playerToken: string;
}

export type LocationReviewStatus = "pending" | "rejected" | "accepted";

export interface LocationReviewEntry {
  id: string;
  lat: number;
  lng: number;
  panoId: string | null;
  manuallyVerified: boolean;
  reviewStatus: LocationReviewStatus;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface LocationReviewQueueResponse {
  index: number;
  total: number;
  pendingCount: number;
  rejectedCount: number;
  hasPrevious: boolean;
  hasNext: boolean;
  entry: LocationReviewEntry | null;
}

export interface UpdateLocationReviewResponse {
  location: LocationReviewEntry;
}

export interface DeleteRejectedLocationsResponse {
  deletedCount: number;
}

export interface DailyGameStatsEntry {
  date: string;
  gamesStarted: number;
  gamesFinished: number;
}

export interface GameStatsResponse {
  days: number;
  timeZone: string;
  generatedAt: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  totals: {
    gamesStarted: number;
    gamesFinished: number;
  };
  series: DailyGameStatsEntry[];
}
