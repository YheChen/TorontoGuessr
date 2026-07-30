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

/**
 * The current round as the browser may see it: pano id and camera only, never
 * the answer coordinates.
 *
 * Reads only. It used to accept a touchDeadline option that rewrote
 * round_started_at to now, so that serving a round restarted its clock. That was
 * an unbounded write on an unauthenticated route: repeated calls kept moving the
 * deadline and the 60s + 15s timeout in submitGuess could never fire. The clock
 * is baselined at insert for the first round and at guess time for every round
 * after, which is sufficient.
 */
export async function getRoundForClient(
  sessionId: string
): Promise<RoundPayload | null> {
  const session = await requireGameSession(sessionId);
  if (session.status !== "in_progress") {
    return null;
  }

  return buildRoundPayload(session);
}

// Opt-in: route guesses through the submit_guess SQL function (one atomic DB
// round trip instead of read-then-write). Off by default so the migration can
// be applied and verified before it goes live; falls back to the JS path on
// any RPC failure.
const guessRpcEnabled = process.env.GUESS_RPC_ENABLED === "true";

const latLngSchema = z.object({ lat: z.number(), lng: z.number() });
const submitGuessRpcSchema = z.object({
  result: z.object({
    roundNumber: z.number().int(),
    score: z.number().int(),
    distance: z.number().nullable(),
    guessLocation: latLngSchema.nullable(),
    actualLocation: latLngSchema,
  }),
  totalScore: z.number().int(),
  gameFinished: z.boolean(),
  isLastRound: z.boolean(),
  guessRejectedLate: z.boolean(),
  nextRound: z
    .object({
      currentRound: z.number().int(),
      totalRounds: z.number().int(),
      round: z.object({
        panoId: z.string(),
        heading: z.number(),
        pitch: z.number(),
        zoom: z.number(),
      }),
      timeLimit: z.number(),
    })
    .nullable(),
});

/**
 * File a just-finished game under the account that played it.
 *
 * Called ONLY by the request that performed the in_progress to finished
 * transition, and that restriction is the entire security model. Session ids of
 * finished games are PUBLIC: getLeaderboard returns them as entry.id. So any code
 * path that could attribute an already-finished session would let a signed-in
 * player claim a stranger's score straight off the leaderboard. Requiring that
 * the caller be the one who just finished it means they had to actually play it.
 *
 * `user_id: null` in the filter makes the claim once-only at the database level,
 * so even a replayed request cannot move a game between accounts.
 *
 * Must never throw. A scored guess is the product; attribution is bookkeeping.
 * The RPC caller below also sits inside a try that falls back to the JS path on
 * any error, and re-running a guess that already finished the game would fail it
 * outright, so swallowing here is load-bearing rather than lazy.
 */
async function attributeFinishedGame(
  sessionId: string,
  userId: string
): Promise<void> {
  try {
    await updateSingleRow<{ id: string }>(
      GAME_SESSIONS_TABLE,
      { user_id: userId },
      {
        filters: { id: sessionId, status: "finished", user_id: null },
        columns: "id",
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[game-store] could not attribute session ${sessionId} to an account ` +
        `(apply link_game_sessions_to_accounts.sql if user_id is missing): ${message}`
    );
  }
}

export async function submitGuess(
  sessionId: string,
  guessLocation: LatLng | null = null,
  // An options object rather than a third positional, so two nullable arguments
  // cannot be transposed at a call site.
  { userId = null }: { userId?: string | null } = {}
) {
  if (guessRpcEnabled) {
    try {
      const payload = await callRpc<unknown>("submit_guess", {
        p_session_id: sessionId,
        p_guess_lat: guessLocation?.lat ?? null,
        p_guess_lng: guessLocation?.lng ?? null,
      });
      const parsed = submitGuessRpcSchema.parse(payload);
      // The RPC performed the transition, so this request is the one allowed to
      // claim the game.
      if (parsed.gameFinished && userId) {
        await attributeFinishedGame(sessionId, userId);
      }
      return {
        ...parsed.result,
        totalScore: parsed.totalScore,
        gameFinished: parsed.gameFinished,
        isLastRound: parsed.isLastRound,
        guessRejectedLate: parsed.guessRejectedLate,
        nextRound: parsed.nextRound,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown RPC failure.";
      console.warn(
        `[game-store] submit_guess RPC failed, using JS path: ${message}`
      );
    }
  }

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

  // The optimistic filter above matched, so this request is the one that just
  // finished the game and is therefore the only one entitled to claim it.
  if (gameFinished && userId) {
    await attributeFinishedGame(sessionId, userId);
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

/**
 * The end-of-game summary.
 *
 * Deliberately does NOT return actualLocation or guessLocation, even though both
 * sit in session.results.
 *
 * This route is reachable by session id alone, with no authentication, and
 * session ids are PUBLIC: getLeaderboard returns them as entry.id. Returning
 * results verbatim therefore handed anyone the full answer key for any finished
 * game listed on the leaderboard. That was worst for the daily challenge, where
 * every player gets the same five rounds, so one stranger's finished daily game
 * was the answer key for everybody's that day.
 *
 * Nothing is lost by omitting them: a player already receives each round's
 * actualLocation in the response to their own guess, which is the only moment it
 * is theirs to know, and the summary UI renders only the score and distance.
 */
export async function getGameSummary(sessionId: string) {
  const session = await requireGameSession(sessionId);
  return {
    username: session.username,
    totalScore: session.totalScore,
    rounds: session.results.map((round) => ({
      roundNumber: round.roundNumber,
      score: round.score,
      distance: round.distance,
    })),
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
    // Shared-challenge games replay a known set of rounds and can be retried
    // freely, so they are kept off the global board. Only filter when the mode
    // column exists; the query is retried without it below otherwise.
    if (sessionSchemaExtended) {
      filters.mode = { op: "neq", value: "challenge" };
    }
  }

  const runQuery = (activeFilters: Filters) =>
    Promise.all([
      selectRows<LeaderboardRecord>(GAME_SESSIONS_TABLE, {
        columns: "id,username,total_score,rounds_played,completed_at",
        filters: activeFilters,
        order: "total_score.desc,completed_at.asc",
        limit,
        offset,
      }),
      countRows(GAME_SESSIONS_TABLE, { filters: activeFilters }),
    ]);

  let records: LeaderboardRecord[] = [];
  let total = 0;
  try {
    [records, total] = await runQuery(filters);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (board === "challenge") {
      // Challenge board before the mode columns exist: present an empty board
      // rather than failing the page. (PostgREST reports the missing `mode`
      // column obliquely, parsing it as its ordered-set aggregate function.)
      console.warn(
        `[game-store] challenge leaderboard unavailable, returning empty board: ${message}`
      );
    } else if ("mode" in filters) {
      // The mode exclusion is a refinement, never a reason to fail the main
      // leaderboard: drop it and serve the board unfiltered.
      const { mode: _excludedMode, ...filtersWithoutMode } = filters;
      console.warn(
        `[game-store] could not exclude challenge games from the global leaderboard, serving unfiltered: ${message}`
      );
      [records, total] = await runQuery(filtersWithoutMode);
    } else {
      throw error;
    }
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
