/**
 * Display-name rules for accounts.
 *
 * Uniqueness is enforced case-insensitively in the database (a unique index on
 * lower(display_name)); this module owns the shape rules and the reserved list.
 * Kept pure so every rule is unit testable.
 */

export const DISPLAY_NAME_MIN_LENGTH = 3;
export const DISPLAY_NAME_MAX_LENGTH = 16;

/**
 * Names nobody may take. Impersonating staff or the app itself is the concern,
 * plus "guest", because unattributed games are already shown as "Guest NNNN"
 * and a real account should not be able to pose as one.
 */
const RESERVED_NAMES = new Set([
  "admin",
  "administrator",
  "anonymous",
  "guest",
  "help",
  "mod",
  "moderator",
  "official",
  "owner",
  "root",
  "staff",
  "support",
  "system",
  "torontoguessr",
  "tg",
  "me",
  "you",
  "null",
  "undefined",
  "deleted",
]);

export type DisplayNameResult =
  | { ok: true; value: string; comparisonKey: string }
  | { ok: false; reason: string };

/**
 * Validate a requested display name.
 *
 * On success returns the name as typed (case is preserved for display) plus the
 * lowercased key the uniqueness index compares on.
 */
export function validateDisplayName(input: unknown): DisplayNameResult {
  if (typeof input !== "string") {
    return { ok: false, reason: "Enter a display name." };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, reason: "Enter a display name." };
  }

  if (trimmed.length < DISPLAY_NAME_MIN_LENGTH) {
    return {
      ok: false,
      reason: `Use at least ${DISPLAY_NAME_MIN_LENGTH} characters.`,
    };
  }

  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    return {
      ok: false,
      reason: `Use at most ${DISPLAY_NAME_MAX_LENGTH} characters.`,
    };
  }

  if (!/^[A-Za-z0-9_]+$/.test(trimmed)) {
    return {
      ok: false,
      reason: "Use only letters, numbers, and underscores.",
    };
  }

  // An all-underscore name is unreadable and hard to tell apart from another.
  if (!/[A-Za-z0-9]/.test(trimmed)) {
    return { ok: false, reason: "Include at least one letter or number." };
  }

  const comparisonKey = trimmed.toLowerCase();

  if (RESERVED_NAMES.has(comparisonKey)) {
    return { ok: false, reason: "That name is reserved." };
  }

  // Blocks "Guest1234" and similar, which would otherwise be indistinguishable
  // from the auto-assigned names used for unattributed games.
  if (/^guest[0-9_]*$/.test(comparisonKey)) {
    return { ok: false, reason: "That name is reserved." };
  }

  return { ok: true, value: trimmed, comparisonKey };
}

/** True when two names collide under the uniqueness rule. */
export function displayNamesCollide(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
