import { randomUUID } from "node:crypto";
import { z } from "zod";
import { calculateDistance, calculateScore } from "./scoring-service.js";
import {
  callRpc,
  countRows,
  insertRow,
  selectRows,
  selectSingleRow,
  updateSingleRow,
  type Filters,
} from "./supabase.js";
import {
  createGuestUsername,
  resolveDefaultUsername,
} from "./username-utils.js";
import type {
  GameMode,
  GameRound,
  GameSession,
  GameSessionRecord,
  LatLng,
  LeaderboardPeriod,
  RoundResult,
} from "./types.js";

export { LEADERBOARD_PERIODS } from "./types.js";

const GAME_SESSIONS_TABLE = "game_sessions";
const GAME_SESSION_COLUMNS_LEGACY =
  "id,username,rounds,current_round_index,total_rounds,total_score,results,rounds_played,status,created_at,completed_at";
const GAME_SESSION_COLUMNS_EXTENDED = `${GAME_SESSION_COLUMNS_LEGACY},mode,challenge_date,round_started_at`;
const DEFAULT_STATS_DAYS = 30;
const DEFAULT_STATS_TIME_ZONE = "America/Toronto";
export const ROUND_TIME_LIMIT_SECONDS = 60;
// Allowance on top of the round timer for network latency and clock skew
// before a guess is treated as a timeout.
const ROUND_DEADLINE_GRACE_SECONDS = 15;

// Flips to false when the mode/deadline columns are missing (migration not
// applied yet); all session operations then degrade to the legacy schema.
let sessionSchemaExtended = true;
let hasWarnedAboutLegacySchema = false;

function sessionColumns(): string {
  return sessionSchemaExtended
    ? GAME_SESSION_COLUMNS_EXTENDED
    : GAME_SESSION_COLUMNS_LEGACY;
}

function isMissingColumnError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /column .* does not exist|could not find the '.*' column/i.test(
      error.message
    )
  );
}

/** Run a session operation, retrying with the legacy schema when the new
 *  columns are missing. */
async function withSessionSchemaFallback<T>(
  operation: () => Promise<T>,
  legacyOperation: () => Promise<T>
): Promise<T> {
  if (!sessionSchemaExtended) {
    return legacyOperation();
  }

  try {
    return await operation();
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    sessionSchemaExtended = false;
    if (!hasWarnedAboutLegacySchema) {
      hasWarnedAboutLegacySchema = true;
      console.warn(
        "[game-store] mode/round_started_at columns missing; run add_game_modes_and_deadlines.sql. Deadlines and daily challenges are disabled until then."
      );
    }
    return legacyOperation();
  }
}

interface RoundPayload {
  currentRound: number;
  totalRounds: number;
  round: Pick<GameRound, "panoId" | "heading" | "pitch" | "zoom">;
  timeLimit: number;
}

interface DailyStatsEntry {
  date: string;
  gamesStarted: number;
  gamesFinished: number;
}

function getLeaderboardSince(period: LeaderboardPeriod): string | null {
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

function buildRoundPayload(session: GameSession): RoundPayload {
  const round = session.rounds[session.currentRoundIndex];
  if (!round) {
    throw new Error("No active round found for this session.");
  }

  return {
    currentRound: session.currentRoundIndex + 1,
    totalRounds: session.totalRounds,
    round: {
      panoId: round.panoId,
      heading: round.heading,
      pitch: round.pitch,
      zoom: round.zoom,
    },
    timeLimit: ROUND_TIME_LIMIT_SECONDS,
  };
}

function mapSessionRecord(record: GameSessionRecord): GameSession {
  return {
    id: record.id,
    username: resolveDefaultUsername(record.username, record.id),
    rounds: Array.isArray(record.rounds) ? record.rounds : [],
    currentRoundIndex: record.current_round_index,
    totalRounds: record.total_rounds,
    totalScore: record.total_score,
    results: Array.isArray(record.results) ? record.results : [],
    roundsPlayed: record.rounds_played ?? 0,
    status: record.status,
    createdAt: record.created_at,
    completedAt: record.completed_at ?? null,
    mode: record.mode ?? "classic",
    challengeDate: record.challenge_date ?? null,
    roundStartedAt: record.round_started_at ?? null,
  };
}

function buildSessionInsert(
  session: GameSession,
  { extended }: { extended: boolean }
): Record<string, unknown> {
  const base: Record<string, unknown> = {
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

  if (extended) {
    base.mode = session.mode;
    base.challenge_date = session.challengeDate;
    base.round_started_at = session.roundStartedAt;
  }

  return base;
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getDateKeyParts(
  value: string | number | Date,
  timeZone: string
): { year: string; month: string; day: string } {
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

function getDateKey(value: string | number | Date, timeZone: string): string {
  const { year, month, day } = getDateKeyParts(value, timeZone);
  return `${year}-${month}-${day}`;
}

function formatUtcDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createDailySeries(days: number, timeZone: string): DailyStatsEntry[] {
  const todayParts = getDateKeyParts(new Date(), timeZone);
  const today = new Date(
    Date.UTC(
      Number(todayParts.year),
      Number(todayParts.month) - 1,
      Number(todayParts.day)
    )
  );
  const series: DailyStatsEntry[] = [];

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

async function requireGameSession(sessionId: string): Promise<GameSession> {
  const fetchWithColumns = async (columns: string) => {
    return selectSingleRow<GameSessionRecord>(GAME_SESSIONS_TABLE, {
      columns,
      filters: { id: sessionId },
    });
  };

  const record = await withSessionSchemaFallback(
    () => fetchWithColumns(GAME_SESSION_COLUMNS_EXTENDED),
    () => fetchWithColumns(GAME_SESSION_COLUMNS_LEGACY)
  );

  if (!record) {
    throw new Error("Game session not found.");
  }

  return mapSessionRecord(record);
}

interface CreateGameSessionOptions {
  mode?: GameMode;
  challengeDate?: string | null;
}

export async function createGameSession(
  rounds: GameRound[],
  { mode = "classic", challengeDate = null }: CreateGameSessionOptions = {}
): Promise<GameSession> {
  const session: GameSession = {
    id: randomUUID(),
    username: createGuestUsername(),
    rounds,
    currentRoundIndex: 0,
    totalRounds: rounds.length,
    totalScore: 0,
    results: [],
    roundsPlayed: 0,
    status: "in_progress",
    createdAt: new Date().toISOString(),
    completedAt: null,
    mode,
    challengeDate: mode === "daily" ? challengeDate : null,
    roundStartedAt: new Date().toISOString(),
  };

  const record = await withSessionSchemaFallback(
    () =>
      insertRow<GameSessionRecord>(
        GAME_SESSIONS_TABLE,
        buildSessionInsert(session, { extended: true }),
        { columns: GAME_SESSION_COLUMNS_EXTENDED }
      ),
    () =>
      insertRow<GameSessionRecord>(
        GAME_SESSIONS_TABLE,
        buildSessionInsert(session, { extended: false }),
        { columns: GAME_SESSION_COLUMNS_LEGACY }
      )
  );

  return mapSessionRecord(record);
}

export async function getRoundForClient(
  sessionId: string,
  { touchDeadline = false }: { touchDeadline?: boolean } = {}
): Promise<RoundPayload | null> {
  const session = await requireGameSession(sessionId);
  if (session.status !== "in_progress") {
    return null;
  }

  // The player is being served this round now; restart its deadline clock.
  if (touchDeadline && sessionSchemaExtended) {
    try {
      await updateSingleRow<GameSessionRecord>(
        GAME_SESSIONS_TABLE,
        { round_started_at: new Date().toISOString() },
        {
          filters: { id: sessionId, status: "in_progress" },
          columns: "id",
        }
      );
    } catch (error) {
      if (isMissingColumnError(error)) {
        sessionSchemaExtended = false;
      } else {
        throw error;
      }
    }
  }

  return buildRoundPayload(session);
}

export async function submitGuess(
  sessionId: string,
  guessLocation: LatLng | null = null
) {
  const session = await requireGameSession(sessionId);
  if (session.status !== "in_progress") {
    throw new Error("Game session is already complete.");
  }

  const roundIndex = session.currentRoundIndex;
  const round = session.rounds[roundIndex];
  if (!round) {
    throw new Error("No active round found for this session.");
  }

  // Enforce the round timer server-side: a guess arriving well past the
  // deadline is treated as a timeout instead of trusting the client clock.
  // Legacy sessions without a recorded start time are exempt.
  const startedAtMs = session.roundStartedAt
    ? Date.parse(session.roundStartedAt)
    : Number.NaN;
  const deadlineMs =
    (ROUND_TIME_LIMIT_SECONDS + ROUND_DEADLINE_GRACE_SECONDS) * 1000;
  const isLate =
    Number.isFinite(startedAtMs) && Date.now() - startedAtMs > deadlineMs;
  const effectiveGuess = isLate ? null : guessLocation;

  const distance =
    effectiveGuess === null
      ? null
      : calculateDistance(
          effectiveGuess.lat,
          effectiveGuess.lng,
          round.lat,
          round.lng
        );

  const score = distance === null ? 0 : calculateScore(distance);

  const result: RoundResult = {
    roundNumber: roundIndex + 1,
    score,
    distance,
    guessLocation: effectiveGuess,
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

  const baseUpdate: Record<string, unknown> = {
    current_round_index: session.currentRoundIndex,
    total_score: session.totalScore,
    results: session.results,
    rounds_played: session.roundsPlayed,
    status: session.status,
    completed_at: session.completedAt,
  };
  const updateFilters = {
    id: sessionId,
    current_round_index: session.currentRoundIndex - 1,
    status: "in_progress",
  };

  const updatedRecord = await withSessionSchemaFallback(
    () =>
      updateSingleRow<GameSessionRecord>(
        GAME_SESSIONS_TABLE,
        // Baseline the next round's deadline at guess time; the /next ping
        // (or legacy /next fetch) restarts it when the round is served.
        { ...baseUpdate, round_started_at: new Date().toISOString() },
        { filters: updateFilters, columns: GAME_SESSION_COLUMNS_EXTENDED }
      ),
    () =>
      updateSingleRow<GameSessionRecord>(GAME_SESSIONS_TABLE, baseUpdate, {
        filters: updateFilters,
        columns: GAME_SESSION_COLUMNS_LEGACY,
      })
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
    // True when a placed guess was discarded for missing the round deadline.
    guessRejectedLate: isLate && guessLocation !== null,
    // Ship the next round with the result so the client can transition (and
    // start warming the next panorama) without another API round trip.
    nextRound: gameFinished ? null : buildRoundPayload(session),
  };
}

export async function getGameSummary(sessionId: string) {
  const session = await requireGameSession(sessionId);
  return {
    username: session.username,
    totalScore: session.totalScore,
    rounds: session.results,
  };
}

export async function saveUsername(sessionId: string, username: string) {
  const session = await requireGameSession(sessionId);

  if (session.status !== "finished") {
    throw new Error("You can only save a username after finishing the game.");
  }

  const updatedRecord = await updateSingleRow<GameSessionRecord>(
    GAME_SESSIONS_TABLE,
    {
      username,
    },
    {
      filters: { id: sessionId, status: "finished" },
      columns: sessionColumns(),
    }
  );

  if (!updatedRecord) {
    throw new Error("Score name could not be saved.");
  }

  return {
    id: updatedRecord.id,
    username: resolveDefaultUsername(updatedRecord.username, updatedRecord.id),
  };
}

/** Calendar date key for "today" in the game's home time zone. */
export function getTorontoDateKey(): string {
  return getDateKey(new Date(), DEFAULT_STATS_TIME_ZONE);
}

/**
 * Deterministic seed in [-1, 1] derived from a string (FNV-1a hash). Used to
 * make daily-challenge round selection identical for every player on a date.
 */
export function seedFromString(value: string): number {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  }
  return (hash / 4294967295) * 2 - 1;
}

export type LeaderboardBoard = "global" | "challenge";

interface LeaderboardQuery {
  limit?: number;
  page?: number;
  period?: LeaderboardPeriod;
  board?: LeaderboardBoard;
}

type LeaderboardRecord = Pick<
  GameSessionRecord,
  "id" | "username" | "total_score" | "rounds_played" | "completed_at"
>;

export async function getLeaderboard({
  limit = 10,
  page = 1,
  period = "lifetime",
  board = "global",
}: LeaderboardQuery = {}) {
  const filters: Filters = { status: "finished" };
  const offset = (page - 1) * limit;

  if (board === "challenge") {
    // Today's daily challenge only; period does not apply.
    filters.mode = "daily";
    filters.challenge_date = getTorontoDateKey();
  } else {
    const since = getLeaderboardSince(period);
    if (since) {
      filters.completed_at = { op: "gte", value: since };
    }
  }

  let records: LeaderboardRecord[] = [];
  let total = 0;
  try {
    [records, total] = await Promise.all([
      selectRows<LeaderboardRecord>(GAME_SESSIONS_TABLE, {
        columns: "id,username,total_score,rounds_played,completed_at",
        filters,
        order: "total_score.desc,completed_at.asc",
        limit,
        offset,
      }),
      countRows(GAME_SESSIONS_TABLE, { filters }),
    ]);
  } catch (error) {
    // Challenge board before the mode columns exist: present an empty board
    // rather than failing the page. (PostgREST reports the missing `mode`
    // column obliquely, parsing it as its ordered-set aggregate function.)
    if (board !== "challenge") {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[game-store] challenge leaderboard unavailable, returning empty board: ${message}`
    );
  }

  const entries = records.map((record) => ({
    id: record.id,
    username: resolveDefaultUsername(record.username, record.id),
    totalScore: record.total_score,
    roundsPlayed: record.rounds_played ?? 0,
    completedAt: record.completed_at,
  }));

  const totalPages = total === 0 ? 1 : Math.ceil(total / limit);

  return {
    entries,
    total,
    page,
    limit,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
  };
}

interface GameStatsQuery {
  days?: number;
  timeZone?: string;
}

/** Row shape returned by the daily_game_stats Postgres function. */
const dailyStatsRpcRowSchema = z.object({
  date: z.string(),
  games_started: z.number().int(),
  games_finished: z.number().int(),
});

let statsRpcAvailable = true;

function buildStatsResponse(days: number, timeZone: string, series: DailyStatsEntry[]) {
  const totals = series.reduce(
    (summary, entry) => ({
      gamesStarted: summary.gamesStarted + entry.gamesStarted,
      gamesFinished: summary.gamesFinished + entry.gamesFinished,
    }),
    { gamesStarted: 0, gamesFinished: 0 }
  );

  return {
    days,
    timeZone,
    generatedAt: new Date().toISOString(),
    rangeStart: series[0]?.date ?? null,
    rangeEnd: series[series.length - 1]?.date ?? null,
    totals,
    series,
  };
}

export async function getDailyGameStats({
  days = DEFAULT_STATS_DAYS,
  timeZone = DEFAULT_STATS_TIME_ZONE,
}: GameStatsQuery = {}) {
  const normalizedTimeZone = isValidTimeZone(timeZone)
    ? timeZone
    : DEFAULT_STATS_TIME_ZONE;

  // Prefer the SQL aggregate: exact counts regardless of row volume, and one
  // round trip instead of two capped row scans.
  if (statsRpcAvailable) {
    try {
      const payload = await callRpc<unknown>("daily_game_stats", {
        days_count: days,
        tz: normalizedTimeZone,
      });
      const rows = z.array(dailyStatsRpcRowSchema).parse(payload);

      const series: DailyStatsEntry[] = rows.map((row) => ({
        date: row.date,
        gamesStarted: row.games_started,
        gamesFinished: row.games_finished,
      }));

      return buildStatsResponse(days, normalizedTimeZone, series);
    } catch (error) {
      // Missing function (migration not applied yet) or transient failure:
      // fall back to the legacy row scan so stats keep working.
      statsRpcAvailable = false;
      const message =
        error instanceof Error ? error.message : "Unknown RPC failure.";
      console.warn(
        `[game-store] daily_game_stats RPC unavailable, using row-scan fallback (capped at 1000 rows per query): ${message}`
      );
    }
  }

  return getDailyGameStatsFromRows(days, normalizedTimeZone);
}

/**
 * Legacy fallback: fetch raw rows and bucket them in JS. Subject to
 * PostgREST's 1,000-row response cap, so counts can undercount on busy
 * ranges. Used only until the daily_game_stats migration is applied.
 */
async function getDailyGameStatsFromRows(days: number, normalizedTimeZone: string) {
  const series = createDailySeries(days, normalizedTimeZone);
  const seriesByDate = new Map(series.map((entry) => [entry.date, entry]));
  const since = new Date(
    Date.now() - (days + 2) * 24 * 60 * 60 * 1000
  ).toISOString();

  const [startedSessions, finishedSessions] = await Promise.all([
    selectRows<Pick<GameSessionRecord, "created_at">>(GAME_SESSIONS_TABLE, {
      columns: "created_at",
      filters: {
        created_at: { op: "gte", value: since },
      },
      order: "created_at.asc",
    }),
    selectRows<Pick<GameSessionRecord, "completed_at">>(GAME_SESSIONS_TABLE, {
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

  return buildStatsResponse(days, normalizedTimeZone, series);
}
