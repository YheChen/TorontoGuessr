import { insertRow, selectSingleRow } from "./supabase.js";
import { generateShortCode } from "./short-code.js";
import { createHttpError } from "./http-utils.js";
import type { ChallengeRecord, GameRound, GameSessionRecord } from "./types.js";

const CHALLENGES_TABLE = "challenges";
const GAME_SESSIONS_TABLE = "game_sessions";
const CHALLENGE_COLUMNS = "code,rounds,source_session_id,created_at";
// Codes are drawn from a 1.07 billion space, so a collision is remote; retry a
// few times anyway rather than failing the request.
const MAX_CODE_ATTEMPTS = 5;

// Flips to false when the challenges table is missing (migration not applied
// yet). Challenge features then report as unavailable instead of erroring
// opaquely, and the rest of the game is unaffected.
let challengesTableAvailable = true;
let hasWarnedAboutMissingTable = false;

function isMissingTableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /relation .* does not exist|could not find the table|does not exist in the schema/i.test(
      error.message
    )
  );
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /duplicate key|already exists|unique constraint/i.test(error.message)
  );
}

function markTableMissing(): void {
  challengesTableAvailable = false;
  if (!hasWarnedAboutMissingTable) {
    hasWarnedAboutMissingTable = true;
    console.warn(
      "[challenge-store] challenges table missing; run add_challenge_links.sql. Challenge links are disabled until then."
    );
  }
}

function unavailableError(): Error {
  return createHttpError(
    503,
    "Challenge links are not available yet. Please try again later."
  );
}

/**
 * Snapshot a session's rounds behind a new short code.
 *
 * The rounds are copied rather than referenced so the challenge keeps working
 * even if the source session is removed, and so it never depends on the
 * location pool staying unchanged.
 */
export async function createChallengeFromSession(
  sessionId: string
): Promise<{ code: string; totalRounds: number }> {
  if (!challengesTableAvailable) {
    throw unavailableError();
  }

  const session = await selectSingleRow<
    Pick<GameSessionRecord, "rounds" | "status">
  >(GAME_SESSIONS_TABLE, {
    columns: "status,rounds",
    filters: { id: sessionId },
  });

  if (!session) {
    throw createHttpError(404, "Game session not found.");
  }

  // Only a FINISHED game may be snapshotted, and this is a security boundary
  // rather than tidiness.
  //
  // A session row holds every round's answer coordinates from the moment it is
  // created. Without this check a player could mint a challenge from their own
  // in-progress game, start a second game from that code, submit five null
  // guesses to read each round's actualLocation out of the guess responses, and
  // then replay the exact coordinates into the original game for a perfect
  // 25,000. The replay session is mode=challenge and excluded from the global
  // board, so only the perfect score would have been published.
  //
  // The frontend already only offers the link on the summary screen
  // (components/challenge-friend.tsx), so nothing legitimate is being refused.
  if (session.status !== "finished") {
    throw createHttpError(
      409,
      "You can only create a challenge link after finishing the game."
    );
  }

  const rounds = Array.isArray(session.rounds) ? session.rounds : [];
  if (rounds.length === 0) {
    throw createHttpError(400, "This game has no rounds to share.");
  }

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = generateShortCode();
    try {
      const record = await insertRow<ChallengeRecord>(
        CHALLENGES_TABLE,
        { code, rounds, source_session_id: sessionId },
        { columns: CHALLENGE_COLUMNS }
      );
      return { code: record.code, totalRounds: rounds.length };
    } catch (error) {
      if (isMissingTableError(error)) {
        markTableMissing();
        throw unavailableError();
      }
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      // Code already taken; loop and try another one.
    }
  }

  throw createHttpError(
    500,
    "Could not allocate a challenge code. Please try again."
  );
}

/**
 * Rounds for a challenge code, or null when no such challenge exists.
 * The code must already be normalized.
 */
export async function getChallengeRounds(
  code: string
): Promise<GameRound[] | null> {
  if (!challengesTableAvailable) {
    throw unavailableError();
  }

  let record: Pick<ChallengeRecord, "rounds"> | null;
  try {
    record = await selectSingleRow<Pick<ChallengeRecord, "rounds">>(
      CHALLENGES_TABLE,
      { columns: "rounds", filters: { code } }
    );
  } catch (error) {
    if (isMissingTableError(error)) {
      markTableMissing();
      throw unavailableError();
    }
    throw error;
  }

  if (!record) {
    return null;
  }

  const rounds = Array.isArray(record.rounds) ? record.rounds : [];
  return rounds.length > 0 ? rounds : null;
}

/** Reset the cached availability flag. Test-only. */
export function resetChallengeStoreState(): void {
  challengesTableAvailable = true;
  hasWarnedAboutMissingTable = false;
}
