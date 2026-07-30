/**
 * Turning an account display name into a leaderboard name.
 *
 * The two namespaces do not share rules. A display name allows underscores and
 * up to 16 characters, while the leaderboard stores at most 10 letters and
 * digits and runs its own blocked-word check server side. Rather than refuse a
 * display name the account system already accepted, drop the characters the
 * leaderboard cannot store and truncate to fit.
 *
 * The server remains the authority: it re-validates whatever is sent and owns
 * the blocked-word list, so the name it returns is the one to display.
 */

/** Longest name the leaderboard will store. Mirrors the backend's rule. */
export const MAX_LEADERBOARD_NAME_LENGTH = 10;

/**
 * The leaderboard form of a display name, or null when nothing usable is left.
 *
 * A null result means "do not submit" rather than "error". The player keeps the
 * guest name already assigned to the game instead of being shown a failure they
 * cannot act on.
 */
export function toLeaderboardName(
  displayName: string | null | undefined
): string | null {
  if (typeof displayName !== "string") {
    return null;
  }

  const stripped = displayName.replace(/[^A-Za-z0-9]/g, "");
  if (!stripped) {
    return null;
  }

  return stripped.slice(0, MAX_LEADERBOARD_NAME_LENGTH);
}
