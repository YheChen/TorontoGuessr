export const DEFAULT_USERNAME = "Guest";
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

function normalizeLeetspeak(value) {
  return value
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t");
}

export function sanitizeUsername(value) {
  const trimmedValue = typeof value === "string" ? value.trim() : "";

  if (!trimmedValue) {
    return DEFAULT_USERNAME;
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
