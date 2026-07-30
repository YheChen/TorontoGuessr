import { randomInt } from "node:crypto";

/**
 * Crockford-style base32: no I, L, O, or U, so codes stay unambiguous when
 * typed, handwritten, or read aloud. 32^6 is about 1.07 billion codes.
 */
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const SHORT_CODE_LENGTH = 6;

/** A fresh random share code in canonical (uppercase) form. */
export function generateShortCode(): string {
  let code = "";
  for (let index = 0; index < SHORT_CODE_LENGTH; index += 1) {
    // randomInt is uniform, unlike Math.random scaled to the alphabet length.
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Normalize a user-supplied code (from a URL or typed by hand) to canonical
 * form, or return null when it cannot be a valid code.
 *
 * Accepts lowercase, surrounding whitespace, and separators like spaces or
 * hyphens, and folds the characters the alphabet omits onto their look-alikes
 * (I and L to 1, O to 0) so a misread code still resolves.
 */
export function normalizeShortCode(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const candidate = input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");

  if (candidate.length !== SHORT_CODE_LENGTH) {
    return null;
  }

  for (const character of candidate) {
    if (!CODE_ALPHABET.includes(character)) {
      return null;
    }
  }

  return candidate;
}
