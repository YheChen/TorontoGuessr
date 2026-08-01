import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";

/**
 * One daily-challenge attempt per player per day.
 *
 * The daily deals every player the same five locations for a date, which is the
 * point: it makes scores comparable. But a guess response has to return that
 * round's actualLocation so the player can see their result, so one play reveals
 * all five answers. With unlimited restarts the whole attack was a notepad: play,
 * write down the coordinates, start again, submit them, 25,000, top of the board.
 *
 * The enforcement itself is a unique index in the database
 * (add_daily_attempt_key.sql), not a check here. A read-then-write check loses a
 * race; an index cannot be raced and holds even for a caller that skips the route.
 * This module only computes the key that index is built on.
 */

/**
 * A first-party random id the browser keeps, so a guest can be recognised across
 * two attempts at the same day's challenge. Never sent anywhere else and never
 * combined with anything identifying.
 */
export const CLIENT_ID_HEADER = "x-client-id";

/** Guard against a client sending something enormous or absurd. */
const MAX_CLIENT_ID_LENGTH = 100;

/**
 * The identity key for one player's attempt at one day's challenge.
 *
 * sha256 of the DATE and the identity together, and the date is in there
 * deliberately. It means the same player hashes to a different value every day, so
 * the column deduplicates within a day and cannot be used to follow anybody across
 * days, which a raw browser id stored in a column would allow. Nothing needs
 * cross-day correlation, so nothing should be able to do it.
 *
 * The identity is the signed-in user's id when there is one, which makes this
 * solid, and a per-browser random id otherwise, which makes it cooperative: a
 * private window is a new player. That limit is real and is documented in the
 * migration; it stops the casual and accidental replay, which is nearly all of it.
 */
/*
 * CODEQL: js/insufficient-password-hash fires here, high severity, because the
 * identity can arrive from toAuthUser and any non-KDF hash of something an auth
 * parser produced looks like a password stored under sha256. Dismissed as a false
 * positive, on four counts rather than on assertion:
 *
 *   1. It is not a password. toAuthUser returns { userId, isAnonymous, email } and
 *      only userId is used here: the Supabase `sub`, a v4 UUID.
 *   2. It is not brute-forceable. A UUID carries 122 bits, so there is no
 *      candidate space to search, which is the entire reason bcrypt and friends
 *      exist for human-chosen passwords.
 *   3. It never leaves the server. The column is not in any payload sent to any
 *      client, and nothing authenticates with it.
 *   4. The thing a stronger construction would protect, which account played on
 *      which day, is stored in PLAINTEXT in game_sessions.user_id, one column
 *      over. HMAC with a server secret was considered and rejected for exactly
 *      that reason: it would add a key to manage and protect nothing that is not
 *      already plainly visible.
 */
export function dailyAttemptKey(
  challengeDate: string,
  identity: string
): string {
  return createHash("sha256")
    .update(`${challengeDate}:${identity}`, "utf8")
    .digest("hex");
}

/** The browser's own id from a request, or null when it sent nothing usable. */
export function readClientId(request: IncomingMessage): string | null {
  const header = request.headers[CLIENT_ID_HEADER];
  if (typeof header !== "string") {
    // An array means the header arrived twice. Picking one would let a caller
    // shop for an identity that has not played yet.
    return null;
  }
  const value = header.trim();
  if (!value || value.length > MAX_CLIENT_ID_LENGTH) {
    return null;
  }
  return value;
}

/**
 * The key to store on a new daily session, or null when there is nothing to key
 * it by.
 *
 * A null means this attempt is not deduplicated at all, which is the honest
 * outcome for a caller that sends no identity: refusing outright would block
 * anyone with storage disabled from ever playing the daily, and the unique index
 * ignores nulls precisely so that stays possible. Preferring the account id means
 * a signed-in player cannot escape by clearing browser storage.
 */
export function resolveDailyKey(
  challengeDate: string | null,
  { userId, clientId }: { userId?: string | null; clientId?: string | null }
): string | null {
  if (!challengeDate) {
    return null;
  }
  const identity = userId ?? clientId;
  if (!identity) {
    return null;
  }
  return dailyAttemptKey(challengeDate, identity);
}
