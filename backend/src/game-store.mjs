import { randomUUID } from "node:crypto";
import { calculateDistance, calculateScore } from "./scoring-service.mjs";

const sessions = new Map();
const finishedGames = [];

function buildRoundPayload(session) {
  const round = session.rounds[session.currentRoundIndex];

  return {
    currentRound: session.currentRoundIndex + 1,
    totalRounds: session.totalRounds,
    round: {
      panoId: round.panoId,
      heading: round.heading,
      pitch: round.pitch,
      zoom: round.zoom,
    },
    timeLimit: 60,
  };
}

export function createGameSession(rounds) {
  const session = {
    id: randomUUID(),
    rounds,
    currentRoundIndex: 0,
    totalRounds: rounds.length,
    totalScore: 0,
    results: [],
    status: "in_progress",
    createdAt: new Date().toISOString(),
  };

  sessions.set(session.id, session);
  return session;
}

export function getGameSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error("Game session not found.");
  }

  return session;
}

export function getRoundForClient(sessionId) {
  const session = getGameSession(sessionId);
  if (session.status !== "in_progress") {
    return null;
  }

  return buildRoundPayload(session);
}

export function submitGuess(sessionId, guessLocation = null) {
  const session = getGameSession(sessionId);
  if (session.status !== "in_progress") {
    throw new Error("Game session is already complete.");
  }

  const roundIndex = session.currentRoundIndex;
  const round = session.rounds[roundIndex];
  if (!round) {
    throw new Error("No active round found for this session.");
  }

  const distance =
    guessLocation === null
      ? null
      : calculateDistance(
          guessLocation.lat,
          guessLocation.lng,
          round.lat,
          round.lng
        );

  const score = distance === null ? 0 : calculateScore(distance);

  const result = {
    roundNumber: roundIndex + 1,
    score,
    distance,
    guessLocation,
    actualLocation: {
      lat: round.lat,
      lng: round.lng,
    },
  };

  session.results.push(result);
  session.totalScore += score;
  session.currentRoundIndex += 1;

  const gameFinished = session.currentRoundIndex >= session.totalRounds;
  if (gameFinished) {
    session.status = "finished";
    session.completedAt = new Date().toISOString();
    finishedGames.push({
      id: session.id,
      totalScore: session.totalScore,
      roundsPlayed: session.results.length,
      completedAt: session.completedAt,
    });
  }

  return {
    ...result,
    totalScore: session.totalScore,
    gameFinished,
    isLastRound: gameFinished,
  };
}

export function getGameSummary(sessionId) {
  const session = getGameSession(sessionId);
  return {
    totalScore: session.totalScore,
    rounds: session.results,
  };
}

export function getLeaderboard(limit = 10) {
  return [...finishedGames]
    .sort((left, right) => right.totalScore - left.totalScore)
    .slice(0, limit);
}
