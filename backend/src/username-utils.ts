import { createHash, randomInt } from "node:crypto";

export const DEFAULT_USERNAME = "Guest 0000";
const LEGACY_DEFAULT_USERNAME = "Guest";
const USERNAME_PATTERN = /^[A-Za-z0-9]{1,10}$/;
const BLOCKED_USERNAME_PATTERNS = [
  "asshole",
  "bastard",
  "bitch",
  "cunt",
  "faggot",
  "fuck",
  "nigga",
  "nigger",
  "penis",
  "pussy",
  "rapist",
  "shit",
  "slut",
  "whore",
];

function normalizeLeetspeak(value: string): string {
  return value
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t");
}

export function createGuestUsername(): string {
  return `Guest ${String(randomInt(0, 10000)).padStart(4, "0")}`;
}

export function resolveDefaultUsername(
  value: string | null | undefined,
  stableSeed = ""
): string {
  if (value && value !== LEGACY_DEFAULT_USERNAME) {
    return value;
  }

  if (!stableSeed) {
    return DEFAULT_USERNAME;
  }

  const hash = createHash("sha256").update(stableSeed).digest("hex");
  const suffix = String(Number.parseInt(hash.slice(0, 8), 16) % 10000).padStart(
    4,
    "0"
  );
  return `Guest ${suffix}`;
}

export function sanitizeUsername(value: unknown): string {
  const trimmedValue = typeof value === "string" ? value.trim() : "";

  if (!trimmedValue) {
    return createGuestUsername();
  }

  if (!USERNAME_PATTERN.test(trimmedValue)) {
    throw new Error("Username must be 1-10 letters or numbers only.");
  }

  const normalizedValue = normalizeLeetspeak(trimmedValue);
  const containsBlockedPattern = BLOCKED_USERNAME_PATTERNS.some((pattern) =>
    normalizedValue.includes(pattern)
  );

  if (containsBlockedPattern) {
    throw new Error("Username is not allowed.");
  }

  return trimmedValue;
}
