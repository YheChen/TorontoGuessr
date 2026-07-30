/**
 * Email input handling.
 *
 * Deliberately permissive. Supabase is the authority on whether an address is
 * acceptable, and a regex strict enough to be genuinely RFC correct rejects
 * addresses that really work. This exists only to catch the obvious typo before
 * spending a single-use captcha token and a rate-limit slot on a round trip that
 * cannot possibly succeed.
 */

/**
 * Trim and lowercase.
 *
 * The local part is case sensitive in the RFC and case insensitive at every
 * provider anyone actually uses. Supabase stores addresses lowercased, so doing
 * it here keeps "Me@example.com" from looking like a second account.
 */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

/** True when an address is worth sending to the server. */
export function isLikelyEmail(input: string): boolean {
  const value = normalizeEmail(input);

  // "a@b.co" is the shortest plausible address; 254 is the practical maximum.
  if (value.length < 6 || value.length > 254) {
    return false;
  }

  if (/\s/.test(value)) {
    return false;
  }

  // One @, something before it, and a domain of at least two dot-separated
  // parts with no empty part.
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(value);
}
