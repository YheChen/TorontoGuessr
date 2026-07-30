import { insertRow, selectSingleRow, updateSingleRow } from "./supabase.js";
import { createHttpError } from "./http-utils.js";
import { validateDisplayName } from "./display-name.js";
import type { AuthUser } from "./auth.js";

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

function mapProfile(record: ProfileRecord): Profile {
  return {
    userId: record.user_id,
    displayName: record.display_name,
    isAnonymous: record.is_anonymous,
    currentStreak: record.current_streak,
    bestStreak: record.best_streak,
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

/** Reset cached availability. Test-only. */
export function resetProfileStoreState(): void {
  profilesTableAvailable = true;
  hasWarnedAboutMissingTable = false;
}
