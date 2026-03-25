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
    totalScore: number;
    rounds: GuessResponse[];
  };
}

export interface LeaderboardEntry {
  id: string;
  totalScore: number;
  roundsPlayed: number;
  completedAt: string;
}
