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
  createPlayToken,
  hashPlayToken,
  requirePlayToken,
} from "./play-token.js";
import { syncStreak } from "./profile-store.js";
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
const GAME_SESSION_COLUMNS_BASE =
  "id,username,rounds,current_round_index,total_rounds,total_score,results,rounds_played,status,created_at,completed_at";
const DEFAULT_STATS_DAYS = 30;
const DEFAULT_STATS_TIME_ZONE = "America/Toronto";
export const ROUND_TIME_LIMIT_SECONDS = 60;
// Allowance on top of the round timer for network latency and clock skew
// before a guess is treated as a timeout.
const ROUND_DEADLINE_GRACE_SECONDS = 15;

/**
 * Optional column groups, each added by its own migration.
 *
 * Every group starts assumed-present and is switched off for the life of the warm
 * instance the first time PostgREST says one of its columns does not exist. So a
 * migration that has not been applied yet degrades one feature instead of failing
 * every request.
 *
 * These are tracked SEPARATELY, one flag per migration, and that matters. The
 * previous version of this was a single boolean over one combined column list, so
 * adding a column to it meant a missing column in the newer migration also
 * disabled the older one: applying add_game_modes_and_deadlines.sql but not
 * add_play_token_to_game_sessions.sql would have silently turned off round
 * deadlines and daily challenges. Per-group probing is what makes it safe to add
 * a column here at all.
 */
const OPTIONAL_COLUMN_GROUPS = {
  /** add_game_modes_and_deadlines.sql */
  modes: {
    columns: ["mode", "challenge_date", "round_started_at"],
    warning:
      "[game-store] mode/round_started_at columns missing; run add_game_modes_and_deadlines.sql. Deadlines and daily challenges are disabled until then.",
  },
  /** add_play_token_to_game_sessions.sql */
  playToken: {
    columns: ["play_token_hash"],
    warning:
      "[game-store] play_token_hash column missing; run add_play_token_to_game_sessions.sql. Games cannot be tied to the player who started them until then, so anyone with a session id can rename its leaderboard entry.",
  },
} as const;

type ColumnGroup = keyof typeof OPTIONAL_COLUMN_GROUPS;

const GROUP_NAMES = Object.keys(OPTIONAL_COLUMN_GROUPS) as ColumnGroup[];

/** Which optional groups this instance still believes exist. */
type SessionSchema = Record<ColumnGroup, boolean>;

const sessionSchema: SessionSchema = {
  modes: true,
  playToken: true,
};
const warnedGroups = new Set<ColumnGroup>();

function currentSchema(): SessionSchema {
  return { ...sessionSchema };
}

function sessionColumns(schema: SessionSchema = currentSchema()): string {
  const optional = GROUP_NAMES.filter((name) => schema[name]).flatMap(
    (name) => OPTIONAL_COLUMN_GROUPS[name].columns
  );
  return [GAME_SESSION_COLUMNS_BASE, ...optional].join(",");
}

function isMissingColumnError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /column .* does not exist|could not find the '.*' column/i.test(
      error.message
    )
  );
}

/**
 * Switch off the optional groups a missing-column error blames, and report
 * whether anything changed.
 *
 * PostgREST names the offending column in both wordings it uses, so the group can
 * usually be identified exactly. When it names none of them (an unrecognised
 * wording, or a column from a group already switched off) nothing is disabled and
 * the caller rethrows, rather than disabling everything on a guess.
 */
function degradeSessionSchema(error: unknown): boolean {
  if (!isMissingColumnError(error) || !(error instanceof Error)) {
    return false;
  }

  let degraded = false;
  for (const name of GROUP_NAMES) {
    const group = OPTIONAL_COLUMN_GROUPS[name];
    const blamed = group.columns.some((column) =>
      error.message.includes(column)
    );
    if (!sessionSchema[name] || !blamed) {
      continue;
    }

    sessionSchema[name] = false;
    degraded = true;
    if (!warnedGroups.has(name)) {
      warnedGroups.add(name);
      console.warn(group.warning);
    }
  }

  return degraded;
}

/**
 * Run a session operation, retrying with fewer optional columns each time one
 * turns out to be missing.
 *
 * The callback receives the schema to build its columns AND its payload from,
 * because inserts and updates have to leave a missing column out of the body too,
 * not just out of the select.
 */
async function withSessionSchema<T>(
  operation: (schema: SessionSchema) => Promise<T>
): Promise<T> {
  // One attempt per group, plus the first: enough to shed every optional group
  // one at a time, and bounded so a persistent error cannot loop.
  for (let attempt = 0; attempt <= GROUP_NAMES.length; attempt += 1) {
    try {
      return await operation(currentSchema());
    } catch (error) {
      if (!degradeSessionSchema(error)) {
        throw error;
      }
    }
  }

  return operation(currentSchema());
}

/** Reset the cached schema probing. Test-only. */
export function resetGameStoreSchemaState(): void {
  for (const name of GROUP_NAMES) {
    sessionSchema[name] = true;
  }
  warnedGroups.clear();
}

interface RoundPayload {
  currentRound: number;
  totalRounds: number;
  round: Pick<GameRound, "panoId" | "heading" | "pitch" | "zoom">;
  timeLimit: number;
}

/**
 * The caller's play token, if they sent one.
 *
 * Always an options object rather than a positional argument. Every route that
 * takes one also takes a session id, and both are opaque strings, so positional
 * arguments could be transposed at a call site and the guard would compare a
 * session id against a hash and refuse every request.
 */
interface PlayTokenOption {
  playToken?: string | null;
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
    playTokenHash: record.play_token_hash ?? null,
  };
}

function buildSessionInsert(
  session: GameSession,
  schema: SessionSchema
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

  if (schema.modes) {
    base.mode = session.mode;
    base.challenge_date = session.challengeDate;
    base.round_started_at = session.roundStartedAt;
  }

  if (schema.playToken) {
    base.play_token_hash = session.playTokenHash;
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
  const record = await withSessionSchema((schema) =>
    selectSingleRow<GameSessionRecord>(GAME_SESSIONS_TABLE, {
      columns: sessionColumns(schema),
      filters: { id: sessionId },
    })
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

/**
 * A new game, plus the one and only copy of its play token.
 *
 * The token is returned rather than stored in the session model because only its
 * hash is persisted, and this is the single moment the plaintext exists. The
 * caller has to hand it to the player now or it is gone.
 */
export async function createGameSession(
  rounds: GameRound[],
  { mode = "classic", challengeDate = null }: CreateGameSessionOptions = {}
): Promise<{ session: GameSession; playToken: string }> {
  const playToken = createPlayToken();
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
    playTokenHash: hashPlayToken(playToken),
  };

  const record = await withSessionSchema((schema) =>
    insertRow<GameSessionRecord>(
      GAME_SESSIONS_TABLE,
      buildSessionInsert(session, schema),
      { columns: sessionColumns(schema) }
    )
  );

  return { session: mapSessionRecord(record), playToken };
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
  sessionId: string,
  { playToken = null }: PlayTokenOption = {}
): Promise<RoundPayload | null> {
  const session = await requireGameSession(sessionId);
  requirePlayToken(session.playTokenHash, playToken);

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
    // Attribution failed, so there is nothing new for the streak to see.
    return;
  }

  // The streak is derived from attributed games, so the only moment it can change
  // is right after one is attributed. Recomputing here rather than on /me keeps
  // the read path a single query. syncStreak swallows its own failures for the
  // same reason this function does: a scored guess must not be lost to
  // bookkeeping.
  await syncStreak(userId);
}

export async function submitGuess(
  sessionId: string,
  guessLocation: LatLng | null = null,
  // An options object rather than a third positional, so two nullable arguments
  // cannot be transposed at a call site.
  {
    userId = null,
    playToken = null,
  }: { userId?: string | null } & PlayTokenOption = {}
) {
  if (guessRpcEnabled) {
    try {
      const payload = await callRpc<unknown>("submit_guess", {
        p_session_id: sessionId,
        p_guess_lat: guessLocation?.lat ?? null,
        p_guess_lng: guessLocation?.lng ?? null,
        // The HASH, never the token: the plaintext must not reach a database log
        // or a pg_stat_statements entry. submit_guess performs the same
        // three-way check requirePlayToken does, inside the row lock, because
        // this path deliberately never reads the row into JS.
        p_play_token_hash: playToken ? hashPlayToken(playToken) : null,
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
  // Before anything is read out of the session or written to it, so a refused
  // request leaves no trace and reveals nothing about the game.
  requirePlayToken(session.playTokenHash, playToken);

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

  const updatedRecord = await withSessionSchema((schema) =>
    updateSingleRow<GameSessionRecord>(
      GAME_SESSIONS_TABLE,
      schema.modes
        ? // Baseline the next round's deadline at guess time; the /next ping
          // (or legacy /next fetch) restarts it when the round is served.
          { ...baseUpdate, round_started_at: new Date().toISOString() }
        : baseUpdate,
      { filters: updateFilters, columns: sessionColumns(schema) }
    )
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
 *
 * No play-token guard of its own, deliberately. Its one caller is the /next route,
 * which reaches it only after getRoundForClient has already checked the token, so
 * a guard here would be a second read for nothing. Everything it returns is public
 * anyway: the score and name are on the leaderboard and the distances are not
 * secret. If it ever gains a second caller, that caller checks the token.
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

/**
 * Put a name on a finished game's leaderboard entry.
 *
 * This route is why play tokens exist. The leaderboard publishes session ids as
 * entry.id, and for as long as this was reachable by session id alone, anybody
 * could rename anybody's entry to anything sanitizeUsername allows: the top score
 * on the board, every entry on the board, repeatedly. The play token is the only
 * thing standing between the board and that, so the guard runs before the status
 * check and before any write.
 */
export async function saveUsername(
  sessionId: string,
  username: string,
  { playToken = null }: PlayTokenOption = {}
) {
  const session = await requireGameSession(sessionId);
  requirePlayToken(session.playTokenHash, playToken);

  if (session.status !== "finished") {
    throw new Error("You can only save a username after finishing the game.");
  }

  const updatedRecord = await withSessionSchema((schema) =>
    updateSingleRow<GameSessionRecord>(
      GAME_SESSIONS_TABLE,
      {
        username,
      },
      {
        filters: { id: sessionId, status: "finished" },
        columns: sessionColumns(schema),
      }
    )
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
> & { user_id?: string | null };

const LEADERBOARD_COLUMNS_BASE =
  "id,username,total_score,rounds_played,completed_at";
/** With attribution, so a name can be resolved from the account that played. */
const LEADERBOARD_COLUMNS = `${LEADERBOARD_COLUMNS_BASE},user_id`;

/** Flips to false when game_sessions.user_id is missing (migration not applied). */
let leaderboardAttributionAvailable = true;

/**
 * Current display names for the accounts behind a page of leaderboard rows.
 *
 * WHY LIVE RATHER THAN STORED. game_sessions.username is a snapshot taken when
 * the name was saved, so renaming an account never touched its past games and the
 * board could show one player under several names. Worse, that column holds at
 * most 10 letters and digits, while a display name allows 16 and underscores, so
 * two different accounts could both arrive as the same truncated string and be
 * genuinely indistinguishable on the board. Reading the account's name at request
 * time fixes both: display names are unique by a case-insensitive index, and
 * nothing is truncated.
 *
 * ONE extra query per page, keyed on at most `limit` ids (25 at the ceiling), so
 * PostgREST's 1000-row cap is not in play. Never a join, because a join would put
 * the row count of both tables into one capped response.
 *
 * Failure is not fatal. A leaderboard that falls back to the stored names is
 * still a leaderboard; one that 500s is not.
 */
async function resolveAccountNames(
  records: readonly LeaderboardRecord[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!leaderboardAttributionAvailable) {
    return names;
  }

  const userIds = [
    ...new Set(
      records
        .map((record) => record.user_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];
  if (userIds.length === 0) {
    return names;
  }

  try {
    const profiles = await selectRows<{
      user_id: string;
      display_name: string | null;
    }>("profiles", {
      columns: "user_id,display_name",
      filters: { user_id: { op: "in", value: userIds } },
      limit: userIds.length,
    });

    for (const profile of profiles) {
      const displayName = profile.display_name?.trim();
      // An account with no name of its own falls through to the stored guest
      // name, which is the only name that game has.
      if (displayName) {
        names.set(profile.user_id, displayName);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[game-store] could not resolve account names for the leaderboard, using stored names: ${message}`
    );
  }

  return names;
}

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
    if (sessionSchema.modes) {
      filters.mode = { op: "neq", value: "challenge" };
    }
  }

  const runQuery = (activeFilters: Filters) =>
    Promise.all([
      selectRows<LeaderboardRecord>(GAME_SESSIONS_TABLE, {
        columns: leaderboardAttributionAvailable
          ? LEADERBOARD_COLUMNS
          : LEADERBOARD_COLUMNS_BASE,
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

    // user_id is only there to look a name up with, so a database without it
    // serves the board under the stored names instead of failing. Checked before
    // the branches below, because this error would otherwise be misread as a
    // missing `mode` column and drop the challenge-game exclusion as well.
    if (leaderboardAttributionAvailable && message.includes("user_id")) {
      leaderboardAttributionAvailable = false;
      console.warn(
        `[game-store] game_sessions.user_id missing; run link_game_sessions_to_accounts.sql. Leaderboard names come from the stored snapshot until then: ${message}`
      );
      [records, total] = await runQuery(filters);
    } else if (board === "challenge") {
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

  const accountNames = await resolveAccountNames(records);

  const entries = records.map((record) => ({
    id: record.id,
    // The account's current name wins when there is one, so a rename shows up on
    // every game the account has played rather than only on games played after it.
    username:
      (record.user_id ? accountNames.get(record.user_id) : null) ??
      resolveDefaultUsername(record.username, record.id),
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
