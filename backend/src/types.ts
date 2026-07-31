/** Shared domain types for the TorontoGuessr backend. */

export interface LatLng {
  lat: number;
  lng: number;
}

/** A playable round: a validated panorama plus an initial point of view. */
export interface GameRound {
  lat: number;
  lng: number;
  panoId: string;
  heading: number;
  pitch: number;
  zoom: number;
}

export interface RoundResult {
  roundNumber: number;
  score: number;
  distance: number | null;
  guessLocation: LatLng | null;
  actualLocation: LatLng;
}

export type GameStatus = "in_progress" | "finished";

export type GameMode = "classic" | "daily" | "challenge";

export const GAME_MODES = ["classic", "daily", "challenge"] as const;

/** Raw `challenges` row shape as returned by PostgREST. */
export interface ChallengeRecord {
  code: string;
  rounds: GameRound[] | null;
  source_session_id: string | null;
  created_at: string;
}

/** Camel-cased session model used inside the backend. */
export interface GameSession {
  id: string;
  username: string;
  rounds: GameRound[];
  currentRoundIndex: number;
  totalRounds: number;
  totalScore: number;
  results: RoundResult[];
  roundsPlayed: number;
  status: GameStatus;
  createdAt: string;
  completedAt: string | null;
  mode: GameMode;
  challengeDate: string | null;
  roundStartedAt: string | null;
  /**
   * sha256 of the play token that authenticates this game's player, or null when
   * no token was issued (a session older than the feature, so grandfathered).
   * Never leaves the backend: see play-token.ts.
   */
  playTokenHash: string | null;
}

/** Raw `game_sessions` row shape as returned by PostgREST. */
export interface GameSessionRecord {
  id: string;
  username: string | null;
  rounds: GameRound[] | null;
  current_round_index: number;
  total_rounds: number;
  total_score: number;
  results: RoundResult[] | null;
  rounds_played: number | null;
  status: GameStatus;
  created_at: string;
  completed_at: string | null;
  mode?: GameMode | null;
  challenge_date?: string | null;
  round_started_at?: string | null;
  /** Absent until add_play_token_to_game_sessions.sql is applied. */
  play_token_hash?: string | null;
}

export type LobbyStatus = "waiting" | "in_progress" | "finished";

/** Raw `lobbies` row shape as returned by PostgREST. */
export interface LobbyRecord {
  id: string;
  join_code: string;
  status: LobbyStatus;
  host_player_id: string;
  /** Answer coordinates: never sent to a client before a round is revealed. */
  rounds: GameRound[] | null;
  total_rounds: number;
  current_round_index: number;
  round_time_limit_seconds: number;
  round_started_at: string | null;
  round_deadline_at: string | null;
  round_revealed: boolean;
  reveal_deadline_at: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

/** One scored round for one lobby player. */
export interface LobbyPlayerResult {
  roundNumber: number;
  score: number;
  distance: number | null;
  guessLocation: LatLng | null;
}

/** Raw `lobby_players` row shape as returned by PostgREST. */
export interface LobbyPlayerRecord {
  id: string;
  lobby_id: string;
  /** Never returned to any client. */
  player_token_hash: string;
  display_name: string;
  total_score: number;
  results: LobbyPlayerResult[] | null;
  is_connected: boolean;
  last_seen_at: string;
  joined_at: string;
}

export const REVIEW_STATUSES = {
  PENDING: "pending",
  REJECTED: "rejected",
  ACCEPTED: "accepted",
} as const;

export type ReviewStatus =
  (typeof REVIEW_STATUSES)[keyof typeof REVIEW_STATUSES];

/** Raw `verified_locations` row shape as returned by PostgREST. */
export interface VerifiedLocationRow {
  id: string;
  lat: number;
  lng: number;
  pano_id: string | null;
  manually_verified: boolean | null;
  review_status: ReviewStatus | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Camel-cased verified location used inside the backend. */
export interface VerifiedLocation {
  id: string;
  lat: number;
  lng: number;
  panoId: string | null;
  manuallyVerified: boolean;
  reviewStatus: ReviewStatus;
  createdAt: string | null;
  updatedAt: string | null;
}

/** A location whose panorama has been confirmed against Street View. */
export interface ValidatedPanorama {
  lat: number;
  lng: number;
  panoId: string;
  copyright: string | null;
}

export const LEADERBOARD_PERIODS = [
  "lifetime",
  "daily",
  "weekly",
  "monthly",
] as const;

export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

export type ReviewAction = "accept" | "reject" | "undo";
