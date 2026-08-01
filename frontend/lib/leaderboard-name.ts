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

/**
 * Remembering a guest's leaderboard name between games.
 *
 * WHY. 1403 of 1504 finished games on the live board are still called "Guest
 * NNNN": 93% of players who finish never put a name on it. Part of that is that
 * the field sits more than a screen below the fold, and part is that a returning
 * player has to type the same name again after every single game. Nothing was
 * remembered, so naming was a per-game chore rather than a one-time choice.
 *
 * Kept in localStorage next to the streak, and device-local for the same reason:
 * a guest has no account to hang it on. Signed-in players do not use this at all,
 * their name comes from their profile.
 */

const NAME_STORAGE_KEY = "tg_leaderboard_name";

/** The remembered name, or null. Safe to call during a server render. */
export function readRememberedName(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    // Run through the same sanitiser as anything else headed for the board, so a
    // value edited by hand in devtools cannot produce a name the server refuses.
    return toLeaderboardName(window.localStorage.getItem(NAME_STORAGE_KEY));
  } catch {
    // Blocked or unavailable storage: behave as if nothing was remembered.
    return null;
  }
}

/** Remember a name for next time. Ignores anything unusable. */
export function rememberName(name: string | null | undefined): void {
  if (typeof window === "undefined") {
    return;
  }
  const usable = toLeaderboardName(name);
  try {
    if (usable) {
      window.localStorage.setItem(NAME_STORAGE_KEY, usable);
    } else {
      window.localStorage.removeItem(NAME_STORAGE_KEY);
    }
  } catch {
    // Storage failures are not worth surfacing: the name still went to the board
    // for this game, it just will not be prefilled next time.
  }
}

/** Forget the remembered name, for a player who wants to be a guest again. */
export function forgetName(): void {
  rememberName(null);
}
