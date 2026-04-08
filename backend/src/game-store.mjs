import { randomUUID } from "node:crypto";
import { calculateDistance, calculateScore } from "./scoring-service.mjs";
import { insertRow, selectRows, selectSingleRow, updateSingleRow } from "./supabase.mjs";

const GAME_SESSIONS_TABLE = "game_sessions";
const GAME_SESSION_COLUMNS =
  "id,rounds,current_round_index,total_rounds,total_score,results,rounds_played,status,created_at,completed_at";

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

function mapSessionRecord(record) {
  return {
    id: record.id,
    rounds: Array.isArray(record.rounds) ? record.rounds : [],
    currentRoundIndex: record.current_round_index,
    totalRounds: record.total_rounds,
    totalScore: record.total_score,
    results: Array.isArray(record.results) ? record.results : [],
    roundsPlayed: record.rounds_played ?? 0,
    status: record.status,
    createdAt: record.created_at,
    completedAt: record.completed_at ?? null,
  };
}

function buildSessionInsert(session) {
  return {
    id: session.id,
    rounds: session.rounds,
    current_round_index: session.currentRoundIndex,
    total_rounds: session.totalRounds,
    total_score: session.totalScore,
    results: session.results,
    rounds_played: session.roundsPlayed,
    status: session.status,
    created_at: session.createdAt,
    completed_at: session.completedAt,
  };
}

async function requireGameSession(sessionId) {
  const record = await selectSingleRow(GAME_SESSIONS_TABLE, {
    columns: GAME_SESSION_COLUMNS,
    filters: { id: sessionId },
  });

  if (!record) {
    throw new Error("Game session not found.");
  }

  return mapSessionRecord(record);
}

export async function createGameSession(rounds) {
  const session = {
    id: randomUUID(),
    rounds,
    currentRoundIndex: 0,
    totalRounds: rounds.length,
    totalScore: 0,
    results: [],
    roundsPlayed: 0,
    status: "in_progress",
    createdAt: new Date().toISOString(),
    completedAt: null,
  };

  const record = await insertRow(GAME_SESSIONS_TABLE, buildSessionInsert(session), {
    columns: GAME_SESSION_COLUMNS,
  });

  return mapSessionRecord(record);
}

export async function getRoundForClient(sessionId) {
  const session = await requireGameSession(sessionId);
  if (session.status !== "in_progress") {
    return null;
  }

  return buildRoundPayload(session);
}

export async function submitGuess(sessionId, guessLocation = null) {
  const session = await requireGameSession(sessionId);
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
  session.roundsPlayed = session.results.length;

  const gameFinished = session.currentRoundIndex >= session.totalRounds;
  if (gameFinished) {
    session.status = "finished";
    session.completedAt = new Date().toISOString();
  }

  const updatedRecord = await updateSingleRow(
    GAME_SESSIONS_TABLE,
    {
      current_round_index: session.currentRoundIndex,
      total_score: session.totalScore,
      results: session.results,
      rounds_played: session.roundsPlayed,
      status: session.status,
      completed_at: session.completedAt,
    },
    {
      filters: {
        id: sessionId,
        current_round_index: session.currentRoundIndex - 1,
        status: "in_progress",
      },
      columns: GAME_SESSION_COLUMNS,
    }
  );

  if (!updatedRecord) {
    throw new Error(
      "Game session changed before your guess was recorded. Please try again."
    );
  }

  return {
    ...result,
    totalScore: updatedRecord.total_score,
    gameFinished,
    isLastRound: gameFinished,
  };
}

export async function getGameSummary(sessionId) {
  const session = await requireGameSession(sessionId);
  return {
    totalScore: session.totalScore,
    rounds: session.results,
  };
}

export async function getLeaderboard(limit = 10) {
  const records = await selectRows(GAME_SESSIONS_TABLE, {
    columns: "id,total_score,rounds_played,completed_at",
    filters: { status: "finished" },
    order: "total_score.desc",
    limit,
  });

  return records.map((record) => ({
    id: record.id,
    totalScore: record.total_score,
    roundsPlayed: record.rounds_played ?? 0,
    completedAt: record.completed_at,
  }));
}
