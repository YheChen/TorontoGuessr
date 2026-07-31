import { insertRow, selectRows, selectSingleRow, updateSingleRow } from "./supabase.js";
import { createHttpError } from "./http-utils.js";
import { validateDisplayName } from "./display-name.js";
import { daysBetweenKeys, torontoDateKey } from "./date-toronto.js";
import { computeStreak, type StreakSummary } from "./streak-service.js";
import type { AuthUser } from "./auth.js";
import type { GameSessionRecord } from "./types.js";

const PROFILES_TABLE = "profiles";
const PROFILE_COLUMNS =
  "user_id,display_name,is_anonymous,current_streak,best_streak,last_played_date,created_at,updated_at";

export interface ProfileRecord {
  user_id: string;
  display_name: string | null;
  is_anonymous: boolean;
  current_streak: number;
  best_streak: number;
  last_played_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  userId: string;
  displayName: string | null;
  isAnonymous: boolean;
  currentStreak: number;
  bestStreak: number;
  lastPlayedDate: string | null;
}

// Flips to false when the profiles table is missing (migration not applied).
// Account features then report as unavailable and nothing else changes.
let profilesTableAvailable = true;
let hasWarnedAboutMissingTable = false;

function isMissingTableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /relation .* does not exist|could not find the table|does not exist in the schema/i.test(
      error.message
    )
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    /duplicate key|unique constraint|already exists/i.test(error.message)
  );
}

function unavailableError(): Error {
  return createHttpError(
    503,
    "Accounts are not available yet. Please try again later."
  );
}

function markTableMissing(): never {
  profilesTableAvailable = false;
  if (!hasWarnedAboutMissingTable) {
    hasWarnedAboutMissingTable = true;
    console.warn(
      "[profile-store] profiles table missing; run add_user_accounts.sql. Accounts are disabled until then."
    );
  }
  throw unavailableError();
}

async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  if (!profilesTableAvailable) {
    throw unavailableError();
  }
  try {
    return await operation();
  } catch (error) {
    if (isMissingTableError(error)) {
      markTableMissing();
    }
    throw error;
  }
}

/**
 * The stored current streak as it should be read TODAY.
 *
 * A stored run goes stale on its own, with no write: a player on a 3 day streak
 * who then misses two days still has current_streak = 3 in the row, because
 * nothing happens when somebody does not play. Clamping on read is why that never
 * shows as a live 3, and it costs nothing, where a nightly job to correct every
 * row would cost a nightly job.
 *
 * Yesterday still counts, the same rule computeStreak and the client's
 * displayedStreak use: the player has the rest of today to continue.
 */
function liveStreak(
  storedStreak: number,
  lastPlayedDate: string | null,
  todayKey: string
): number {
  if (!lastPlayedDate) {
    return 0;
  }
  const gap = daysBetweenKeys(lastPlayedDate, todayKey);
  if (gap === null || gap > 1) {
    return 0;
  }
  return storedStreak;
}

function mapProfile(
  record: ProfileRecord,
  todayKey: string = torontoDateKey()
): Profile {
  return {
    userId: record.user_id,
    displayName: record.display_name,
    isAnonymous: record.is_anonymous,
    currentStreak: liveStreak(
      record.current_streak ?? 0,
      record.last_played_date,
      todayKey
    ),
    bestStreak: record.best_streak ?? 0,
    lastPlayedDate: record.last_played_date,
  };
}

/**
 * The caller's profile, created on first sight.
 *
 * Created lazily rather than by a database trigger on auth.users, so the row
 * only exists for users who actually reach the app.
 */
export async function getOrCreateProfile(user: AuthUser): Promise<Profile> {
  const existing = await guarded(() =>
    selectSingleRow<ProfileRecord>(PROFILES_TABLE, {
      columns: PROFILE_COLUMNS,
      filters: { user_id: user.userId },
    })
  );

  if (existing) {
    // Keep the mirrored flag honest when an anonymous account is upgraded.
    if (existing.is_anonymous !== user.isAnonymous) {
      const updated = await guarded(() =>
        updateSingleRow<ProfileRecord>(
          PROFILES_TABLE,
          { is_anonymous: user.isAnonymous },
          { filters: { user_id: user.userId }, columns: PROFILE_COLUMNS }
        )
      );
      return mapProfile(updated ?? existing);
    }
    return mapProfile(existing);
  }

  try {
    const created = await guarded(() =>
      insertRow<ProfileRecord>(
        PROFILES_TABLE,
        { user_id: user.userId, is_anonymous: user.isAnonymous },
        { columns: PROFILE_COLUMNS }
      )
    );
    return mapProfile(created);
  } catch (error) {
    // Two concurrent first requests can both try to insert; the loser just
    // reads the winner's row.
    if (isUniqueViolation(error)) {
      const row = await guarded(() =>
        selectSingleRow<ProfileRecord>(PROFILES_TABLE, {
          columns: PROFILE_COLUMNS,
          filters: { user_id: user.userId },
        })
      );
      if (row) {
        return mapProfile(row);
      }
    }
    throw error;
  }
}

/**
 * Claim a display name.
 *
 * Uniqueness is decided by the database's case-insensitive index rather than a
 * read-then-write check here, so two people claiming the same name at the same
 * moment cannot both succeed.
 */
export async function setDisplayName(
  user: AuthUser,
  requested: unknown
): Promise<Profile> {
  const validated = validateDisplayName(requested);
  if (!validated.ok) {
    throw createHttpError(400, validated.reason);
  }

  await getOrCreateProfile(user);

  try {
    const updated = await guarded(() =>
      updateSingleRow<ProfileRecord>(
        PROFILES_TABLE,
        { display_name: validated.value },
        { filters: { user_id: user.userId }, columns: PROFILE_COLUMNS }
      )
    );
    if (!updated) {
      throw createHttpError(404, "Profile not found.");
    }
    return mapProfile(updated);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw createHttpError(409, "That name is already taken.");
    }
    throw error;
  }
}

const GAME_SESSIONS_TABLE = "game_sessions";
/**
 * How many finished games back the streak is derived from.
 *
 * Ordered newest first, so the current run is always complete no matter how many
 * games the player has: the run has to reach yesterday to count, and 1000 games
 * cover far more than the days that could span. `best` is what a very heavy
 * player could see understated, since a run older than this window is invisible
 * here, and that is the tradeoff for one bounded query instead of paging through
 * a whole history on every finished game.
 *
 * Also PostgREST's own hard response cap, so asking for more would silently
 * return this many anyway.
 */
const STREAK_WINDOW_GAMES = 1000;

/** Flips to false when game_sessions.user_id is missing (migration not applied). */
let attributionAvailable = true;
let hasWarnedAboutAttribution = false;

function isMissingColumnError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /column .* does not exist|could not find the '.*' column/i.test(
      error.message
    )
  );
}

/** The Toronto days this account finished a game on, newest first. */
async function playedDateKeys(userId: string): Promise<string[] | null> {
  if (!attributionAvailable) {
    return null;
  }

  try {
    const rows = await selectRows<Pick<GameSessionRecord, "completed_at">>(
      GAME_SESSIONS_TABLE,
      {
        columns: "completed_at",
        filters: { user_id: userId, status: "finished" },
        order: "completed_at.desc",
        limit: STREAK_WINDOW_GAMES,
      }
    );

    return rows
      .map((row) => row.completed_at)
      .filter((value): value is string => typeof value === "string")
      .map((value) => torontoDateKey(value));
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }
    attributionAvailable = false;
    if (!hasWarnedAboutAttribution) {
      hasWarnedAboutAttribution = true;
      console.warn(
        "[profile-store] game_sessions.user_id missing; run link_game_sessions_to_accounts.sql. Streaks cannot be derived from played games until then."
      );
    }
    return null;
  }
}

/**
 * Recompute this account's streak from its finished games and store the result.
 *
 * Called from the guess that finishes a game, which is the only moment the answer
 * can change, so /me stays a single read. Returns the summary it wrote, or null
 * when it could not derive one.
 *
 * NEVER THROWS. Its caller is the scored-guess path, where a streak is
 * bookkeeping and the score is the product. A failure here that surfaced as a 500
 * would lose a player their round to protect a decoration.
 *
 * `best` only ever moves up. The window above cannot see a run that has scrolled
 * out of it, and a stored best imported from a device (importStreakBest) is not
 * derivable at all, so overwriting with the derived value would silently erase
 * both.
 */
export async function syncStreak(userId: string): Promise<StreakSummary | null> {
  try {
    const keys = await playedDateKeys(userId);
    if (keys === null) {
      return null;
    }

    const derived = computeStreak(keys);
    const existing = await guarded(() =>
      selectSingleRow<ProfileRecord>(PROFILES_TABLE, {
        columns: PROFILE_COLUMNS,
        filters: { user_id: userId },
      })
    );

    // No profile row yet: the account has never called /me, so there is nothing
    // to update. getOrCreateProfile will derive it on first sight instead.
    if (!existing) {
      return derived;
    }

    const next: StreakSummary = {
      current: derived.current,
      best: Math.max(derived.best, existing.best_streak ?? 0),
      lastPlayedDate: derived.lastPlayedDate,
    };

    if (
      existing.current_streak === next.current &&
      existing.best_streak === next.best &&
      existing.last_played_date === next.lastPlayedDate
    ) {
      return next;
    }

    await guarded(() =>
      updateSingleRow<ProfileRecord>(
        PROFILES_TABLE,
        {
          current_streak: next.current,
          best_streak: next.best,
          last_played_date: next.lastPlayedDate,
        },
        { filters: { user_id: userId }, columns: PROFILE_COLUMNS }
      )
    );

    return next;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[profile-store] could not sync the streak for ${userId}: ${message}`
    );
    return null;
  }
}

/**
 * Carry a streak earned before the account existed onto the account.
 *
 * The one number that cannot be derived. Sign-in is deferred to the summary
 * screen, so a player can arrive with a genuine 30 day run in localStorage and
 * not one attributed game to show for it. Refusing to accept it would make
 * creating an account cost them their streak, which is the opposite of what the
 * card offers.
 *
 * So this trusts the client, within limits. It only ever raises `best`, never
 * `current`, and it clamps to the number of days the game has existed, because a
 * streak longer than that is not a streak, it is a typo or a forgery. `current`
 * stays derived and therefore unforgeable, which matters because that is the
 * number the UI shows most.
 */
export async function importStreakBest(
  user: AuthUser,
  requestedBest: number,
  { launchDateKey = LAUNCH_DATE_KEY, todayKey = torontoDateKey() } = {}
): Promise<Profile> {
  const profile = await getOrCreateProfile(user);

  const maxPossible = maxStreakDays(launchDateKey, todayKey);
  const claimed = Math.floor(requestedBest);
  const bounded = Number.isFinite(claimed)
    ? Math.min(Math.max(claimed, 0), maxPossible)
    : 0;

  if (bounded <= profile.bestStreak) {
    return profile;
  }

  const updated = await guarded(() =>
    updateSingleRow<ProfileRecord>(
      PROFILES_TABLE,
      { best_streak: bounded },
      { filters: { user_id: user.userId }, columns: PROFILE_COLUMNS }
    )
  );

  return updated ? mapProfile(updated) : profile;
}

/** The day the game opened. Nothing can have a streak that predates it. */
const LAUNCH_DATE_KEY = "2026-04-01";

function maxStreakDays(launchDateKey: string, todayKey: string): number {
  const span = daysBetweenKeys(launchDateKey, todayKey);
  return span === null || span < 0 ? 1 : span + 1;
}

/** One finished game, as the account's history page shows it. */
export interface GameHistoryEntry {
  sessionId: string;
  totalScore: number;
  roundsPlayed: number;
  completedAt: string | null;
  mode: string;
}

/**
 * This account's finished games, newest first.
 *
 * A player's FIRST game is never here, and that is structural rather than a bug:
 * sign-in is offered on the summary screen, so the account does not exist while
 * the game that led to it is being attributed. The page says so instead of
 * looking like it lost something.
 */
export async function getGameHistory(
  userId: string,
  { limit = 20, page = 1 }: { limit?: number; page?: number } = {}
): Promise<{ entries: GameHistoryEntry[]; hasNextPage: boolean }> {
  if (!attributionAvailable) {
    return { entries: [], hasNextPage: false };
  }

  // One extra row rather than a count query: all the page needs to know is
  // whether there is more, and a count doubles the round trips to say so.
  const rows = await selectRows<
    Pick<
      GameSessionRecord,
      "id" | "total_score" | "rounds_played" | "completed_at" | "mode"
    >
  >(GAME_SESSIONS_TABLE, {
    columns: "id,total_score,rounds_played,completed_at,mode",
    filters: { user_id: userId, status: "finished" },
    order: "completed_at.desc",
    limit: limit + 1,
    offset: (page - 1) * limit,
  });

  return {
    entries: rows.slice(0, limit).map((row) => ({
      sessionId: row.id,
      totalScore: row.total_score,
      roundsPlayed: row.rounds_played ?? 0,
      completedAt: row.completed_at,
      mode: row.mode ?? "classic",
    })),
    hasNextPage: rows.length > limit,
  };
}

/** Reset cached availability. Test-only. */
export function resetProfileStoreState(): void {
  profilesTableAvailable = true;
  hasWarnedAboutMissingTable = false;
  attributionAvailable = true;
  hasWarnedAboutAttribution = false;
}
