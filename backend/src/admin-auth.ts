import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { createHttpError } from "./http-utils.js";
import { checkRateLimit, clientIp } from "./rate-limit.js";

/**
 * Admin authentication for the location-review tools.
 *
 * This is a single shared secret (ADMIN_REVIEW_TOKEN), which has real limits:
 * it identifies nobody, never expires, and lives in the browser's localStorage
 * where any XSS on the site could read it. Replacing it with a role claim on a
 * real account is the eventual fix. Until then the two cheap protections are
 * here: failed attempts are rate limited so the token cannot be brute forced,
 * and the comparison does not leak timing.
 */

/** Failed attempts allowed per IP per minute before the address is refused. */
const FAILED_ATTEMPT_LIMIT = 10;
/** Overall admin request ceiling per IP, generous for a human reviewer. */
const REQUEST_LIMIT = 120;
const WINDOW_MS = 60_000;

/**
 * Constant-time string comparison.
 *
 * Both sides are hashed first so the comparison is always over equal-length
 * buffers: timingSafeEqual throws on a length mismatch, and comparing raw
 * lengths would leak the secret's length.
 */
export function safeTokenEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a, "utf8").digest();
  const right = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(left, right);
}

/**
 * The admin token from a request, accepting either the dedicated header or a
 * bearer token. Returns null when neither carries a non-empty value.
 */
export function extractAdminToken(request: IncomingMessage): string | null {
  const headerToken = request.headers["x-admin-token"];
  if (typeof headerToken === "string" && headerToken.trim()) {
    return headerToken.trim();
  }

  const authHeader = request.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.slice("Bearer ".length).trim();
    if (bearer) {
      return bearer;
    }
  }

  return null;
}

/**
 * Reject the request unless it carries the admin token.
 *
 * Throws 500 when unconfigured, 429 once an address has burned through its
 * failed attempts, and 401 otherwise. Volume is capped separately so the
 * review endpoints themselves cannot be hammered.
 */
export function requireAdminToken(request: IncomingMessage): void {
  const expectedToken = process.env.ADMIN_REVIEW_TOKEN?.trim();
  if (!expectedToken) {
    throw createHttpError(500, "ADMIN_REVIEW_TOKEN is not configured.");
  }

  const ip = clientIp(request);

  const volume = checkRateLimit(`admin:${ip}`, {
    limit: REQUEST_LIMIT,
    windowMs: WINDOW_MS,
  });
  if (!volume.allowed) {
    throw createHttpError(429, "Too many admin requests. Please slow down.");
  }

  const providedToken = extractAdminToken(request);
  if (providedToken && safeTokenEqual(providedToken, expectedToken)) {
    return;
  }

  // Only failures count against this bucket, so a working session is never
  // locked out by someone else guessing from the same address.
  const attempts = checkRateLimit(`admin-auth-fail:${ip}`, {
    limit: FAILED_ATTEMPT_LIMIT,
    windowMs: WINDOW_MS,
  });
  if (!attempts.allowed) {
    throw createHttpError(
      429,
      "Too many failed attempts. Please wait before trying again."
    );
  }

  throw createHttpError(401, "Unauthorized.");
}
