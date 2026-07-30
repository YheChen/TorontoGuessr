import { daysBetweenKeys, torontoDateKey } from "@/lib/date-toronto";

/**
 * Daily-play streak, kept in localStorage.
 *
 * Device-local by design for now: there are no accounts, so a streak lives in
 * one browser and is lost when its storage is cleared. It is decoration, never
 * an input to scoring or the leaderboard, so it does not matter that a player
 * could edit it.
 *
 * Days are counted on the same America/Toronto boundary the stats page uses,
 * so a streak cannot disagree with the rest of the app about when today ended.
 */

const STORAGE_KEY = "tg_streak";
/** Bump when the stored shape changes; unknown versions are discarded. */
const STORAGE_VERSION = 1;

export interface StreakState {
  /** Consecutive days played, including today once recorded. */
  current: number;
  /** Best run ever reached on this device. */
  best: number;
  /** Toronto date key of the last recorded play, or null if never. */
  lastPlayedDate: string | null;
}

export const EMPTY_STREAK: StreakState = {
  current: 0,
  best: 0,
  lastPlayedDate: null,
};

/**
 * The streak after recording a play on `todayKey`.
 *
 * Pure, and idempotent for repeat plays on the same day, which is what keeps a
 * re-rendered summary screen from inflating the count.
 */
export function advanceStreak(
  state: StreakState,
  todayKey: string
): StreakState {
  const gap = state.lastPlayedDate
    ? daysBetweenKeys(state.lastPlayedDate, todayKey)
    : null;

  let current: number;
  if (gap === 0) {
    // Already counted today.
    current = Math.max(1, state.current);
  } else if (gap === 1) {
    current = state.current + 1;
  } else if (gap !== null && gap < 0) {
    // Stored date is in the future: a clock change or a trip across time zones.
    // Leave the run alone rather than punishing something the player did not do.
    current = Math.max(1, state.current);
  } else {
    // First ever play, a gap of two or more days, or an unreadable stored date.
    current = 1;
  }

  return {
    current,
    best: Math.max(state.best, current),
    lastPlayedDate: gap === 0 || (gap !== null && gap < 0)
      ? (state.lastPlayedDate ?? todayKey)
      : todayKey,
  };
}

/**
 * How a stored streak should be displayed given today's date. A run that was
 * broken by not playing shows as 0 rather than a stale number, without needing
 * a write to correct it.
 */
export function displayedStreak(
  state: StreakState,
  todayKey: string
): StreakState {
  if (!state.lastPlayedDate) {
    return state;
  }
  const gap = daysBetweenKeys(state.lastPlayedDate, todayKey);
  // Today or yesterday means the run is still alive: yesterday's counts because
  // the player has the rest of today to continue it.
  if (gap === null || gap > 1) {
    return { ...state, current: 0 };
  }
  return state;
}

/** Defensive parse: anything unexpected is treated as no streak at all. */
export function parseStreak(raw: string | null): StreakState {
  if (!raw) {
    return EMPTY_STREAK;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { version?: unknown }).version !== STORAGE_VERSION
    ) {
      return EMPTY_STREAK;
    }
    const { current, best, lastPlayedDate } = parsed as Record<string, unknown>;
    return {
      current: typeof current === "number" && current >= 0 ? current : 0,
      best: typeof best === "number" && best >= 0 ? best : 0,
      lastPlayedDate:
        typeof lastPlayedDate === "string" && lastPlayedDate ? lastPlayedDate : null,
    };
  } catch {
    return EMPTY_STREAK;
  }
}

export function serializeStreak(state: StreakState): string {
  return JSON.stringify({ version: STORAGE_VERSION, ...state });
}

/** Stored streak as it should be shown right now. Safe to call on the server. */
export function readStreak(now: Date = new Date()): StreakState {
  if (typeof window === "undefined") {
    return EMPTY_STREAK;
  }
  try {
    const stored = parseStreak(window.localStorage.getItem(STORAGE_KEY));
    return displayedStreak(stored, torontoDateKey(now));
  } catch {
    // Blocked or unavailable storage: behave as if there is no streak.
    return EMPTY_STREAK;
  }
}

/** Record a finished game for today and return the updated streak. */
export function recordPlayedToday(now: Date = new Date()): StreakState {
  if (typeof window === "undefined") {
    return EMPTY_STREAK;
  }
  try {
    const stored = parseStreak(window.localStorage.getItem(STORAGE_KEY));
    const next = advanceStreak(stored, torontoDateKey(now));
    window.localStorage.setItem(STORAGE_KEY, serializeStreak(next));
    return next;
  } catch {
    return EMPTY_STREAK;
  }
}
