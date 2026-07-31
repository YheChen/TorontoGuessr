import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { createHttpError } from "./http-utils.js";

/**
 * The play token: proof that you are the player whose game this is.
 *
 * A session id is an identifier, not a credential, and this codebase kept
 * treating it as one. getLeaderboard publishes session ids as entry.id, so
 * anyone can enumerate them, and every route keyed on a session id alone was
 * therefore open to everyone. POST /games/:sessionId/username was the live case:
 * any finished leaderboard entry could be renamed by anybody.
 *
 * So POST /games/start now mints one of these, returns it once, and stores only
 * its sha256. The gameplay routes require it. Same shape as
 * lobby_players.player_token_hash, which already worked this way for multiplayer.
 */

/** Header carrying the token. A header, not a query parameter, so it never
 *  lands in a URL, a referrer, or an access log. */
export const PLAY_TOKEN_HEADER = "x-play-token";

/**
 * A fresh token. 32 bytes of CSPRNG output, hex encoded.
 *
 * randomBytes rather than randomUUID (which the lobby uses): a v4 UUID carries
 * only 122 bits and spends characters on formatting. There is no reason to hand
 * a guessable-adjacent credential to the one route whose whole job is to be
 * unguessable.
 */
export function createPlayToken(): string {
  return randomBytes(32).toString("hex");
}

/** sha256, hex. The only form of the token that is ever stored. */
export function hashPlayToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Constant-time comparison of two hex digests.
 *
 * Both sides are hashed again so the buffers are always the same length:
 * timingSafeEqual throws on a length mismatch, which would itself leak. Timing
 * here protects little on its own, since the stored value is already a digest and
 * learning it does not yield a token, but the cost is a hash and the convention
 * is already set by safeTokenEqual in admin-auth.ts.
 */
function digestsEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a, "utf8").digest();
  const right = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(left, right);
}

/** The token from a request, or null when the header is absent or blank. */
export function readPlayToken(request: IncomingMessage): string | null {
  const header = request.headers[PLAY_TOKEN_HEADER];
  if (typeof header !== "string") {
    return null;
  }
  const token = header.trim();
  return token ? token : null;
}

/**
 * Refuse the request unless the token matches the hash stored on the session.
 *
 * GRANDFATHERING. A null stored hash means no token was ever issued for that
 * session, and those requests are allowed through. Two situations produce one:
 * a session that predates this feature, and a session started in the gap between
 * the migration and the deploy. Refusing them would end a game somebody is in the
 * middle of, to protect a session whose id nobody has published. The migration
 * writes an unmatchable sentinel over every row old enough to be safe to close,
 * so the grandfathered set is only ever sessions from the last couple of hours.
 *
 * The failure messages say what to do rather than just what went wrong. The one
 * legitimate way to reach them is a browser holding a JavaScript bundle from
 * before the deploy, which starts a game that gets a token it does not know to
 * send; reloading fixes it, so the message says so.
 */
export function requirePlayToken(
  storedHash: string | null | undefined,
  providedToken: string | null
): void {
  if (!storedHash) {
    return;
  }

  if (!providedToken) {
    throw createHttpError(
      401,
      "This game could not be verified. Reload the page to start a new one."
    );
  }

  if (!digestsEqual(hashPlayToken(providedToken), storedHash)) {
    throw createHttpError(
      403,
      "That game belongs to a different player. Reload the page to start your own."
    );
  }
}
