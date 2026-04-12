import { randomUUID } from "node:crypto";
import { calculateDistance, calculateScore } from "./scoring-service.mjs";
import { insertRow, selectRows, selectSingleRow, updateSingleRow } from "./supabase.mjs";
import { DEFAULT_USERNAME } from "./username-utils.mjs";

const GAME_SESSIONS_TABLE = "game_sessions";
const GAME_SESSION_COLUMNS =
  "id,username,rounds,current_round_index,total_rounds,total_score,results,rounds_played,status,created_at,completed_at";
export const LEADERBOARD_PERIODS = [
  "lifetime",
  "daily",
  "weekly",
  "monthly",
];
const DEFAULT_STATS_DAYS = 30;
const DEFAULT_STATS_TIME_ZONE = "America/Toronto";

function getLeaderboardSince(period) {
  const now = Date.now();

  switch (period) {
    case "daily":
      return new Date(now - 24 * 60 * 60 * 1000).toISOString();
    case "weekly":
      return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    case "monthly":
      return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    default:
      return null;
  }
}

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
    username: record.username ?? DEFAULT_USERNAME,
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
    username: session.username,
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

function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getDateKeyParts(value, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Could not derive a calendar date for game statistics.");
  }

  return { year, month, day };
}

function getDateKey(value, timeZone) {
  const { year, month, day } = getDateKeyParts(value, timeZone);
  return `${year}-${month}-${day}`;
}

function formatUtcDateKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createDailySeries(days, timeZone) {
  const todayParts = getDateKeyParts(new Date(), timeZone);
  const today = new Date(
    Date.UTC(
      Number(todayParts.year),
      Number(todayParts.month) - 1,
      Number(todayParts.day)
    )
  );
  const series = [];

  for (let index = days - 1; index >= 0; index -= 1) {
    const current = new Date(today);
    current.setUTCDate(today.getUTCDate() - index);

    series.push({
      date: formatUtcDateKey(current),
      gamesStarted: 0,
      gamesFinished: 0,
    });
  }

  return series;
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
    username: DEFAULT_USERNAME,
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
    username: session.username,
    totalScore: session.totalScore,
    rounds: session.results,
  };
}

export async function saveUsername(sessionId, username) {
  const session = await requireGameSession(sessionId);

  if (session.status !== "finished") {
    throw new Error("You can only save a username after finishing the game.");
  }

  const updatedRecord = await updateSingleRow(
    GAME_SESSIONS_TABLE,
    {
      username,
    },
    {
      filters: { id: sessionId, status: "finished" },
      columns: GAME_SESSION_COLUMNS,
    }
  );

  if (!updatedRecord) {
    throw new Error("Score name could not be saved.");
  }

  return {
    id: updatedRecord.id,
    username: updatedRecord.username ?? DEFAULT_USERNAME,
  };
}

export async function getLeaderboard({ limit = 10, period = "lifetime" } = {}) {
  const since = getLeaderboardSince(period);
  const filters = { status: "finished" };

  if (since) {
    filters.completed_at = { op: "gte", value: since };
  }

  const records = await selectRows(GAME_SESSIONS_TABLE, {
    columns: "id,username,total_score,rounds_played,completed_at",
    filters,
    order: "total_score.desc,completed_at.asc",
    limit,
  });

  return records.map((record) => ({
    id: record.id,
    username: record.username ?? DEFAULT_USERNAME,
    totalScore: record.total_score,
    roundsPlayed: record.rounds_played ?? 0,
    completedAt: record.completed_at,
  }));
}

export async function getDailyGameStats({
  days = DEFAULT_STATS_DAYS,
  timeZone = DEFAULT_STATS_TIME_ZONE,
} = {}) {
  const normalizedTimeZone = isValidTimeZone(timeZone)
    ? timeZone
    : DEFAULT_STATS_TIME_ZONE;
  const series = createDailySeries(days, normalizedTimeZone);
  const seriesByDate = new Map(series.map((entry) => [entry.date, entry]));
  const since = new Date(Date.now() - (days + 2) * 24 * 60 * 60 * 1000).toISOString();

  const [startedSessions, finishedSessions] = await Promise.all([
    selectRows(GAME_SESSIONS_TABLE, {
      columns: "created_at",
      filters: {
        created_at: { op: "gte", value: since },
      },
      order: "created_at.asc",
    }),
    selectRows(GAME_SESSIONS_TABLE, {
      columns: "completed_at",
      filters: {
        status: "finished",
        completed_at: { op: "gte", value: since },
      },
      order: "completed_at.asc",
    }),
  ]);

  for (const session of startedSessions) {
    const date = getDateKey(session.created_at, normalizedTimeZone);
    const entry = seriesByDate.get(date);

    if (entry) {
      entry.gamesStarted += 1;
    }
  }

  for (const session of finishedSessions) {
    if (!session.completed_at) {
      continue;
    }

    const date = getDateKey(session.completed_at, normalizedTimeZone);
    const entry = seriesByDate.get(date);

    if (entry) {
      entry.gamesFinished += 1;
    }
  }

  const totals = series.reduce(
    (summary, entry) => ({
      gamesStarted: summary.gamesStarted + entry.gamesStarted,
      gamesFinished: summary.gamesFinished + entry.gamesFinished,
    }),
    { gamesStarted: 0, gamesFinished: 0 }
  );

  return {
    days,
    timeZone: normalizedTimeZone,
    generatedAt: new Date().toISOString(),
    rangeStart: series[0]?.date ?? null,
    rangeEnd: series[series.length - 1]?.date ?? null,
    totals,
    series,
  };
}
