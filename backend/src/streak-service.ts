import { daysBetweenKeys, shiftDateKey, torontoDateKey } from "./date-toronto.js";

/**
 * Daily-play streaks, derived from the games actually played.
 *
 * This replaces trusting a number the client uploads. Streaks used to live only
 * in localStorage; profiles.current_streak existed, was read in six places, and
 * was written in none, so it was 0 for every account while the UI claimed the
 * streak was stored there. It is derived here instead because PR 46 gave
 * game_sessions a user_id, which means the games themselves are the record and
 * nothing has to be taken on faith.
 *
 * Derived, not accumulated: there is no counter to drift, no double-count to
 * guard against, and recomputing after any change always lands on the same
 * answer. The one number that cannot be derived is `best` from before the
 * account existed, and importStreakBest handles that separately.
 */

export interface StreakSummary {
  /** Consecutive days played, counting a run that reaches today or yesterday. */
  current: number;
  /** Longest run within the days supplied. */
  best: number;
  /** The most recent day played, or null when none were. */
  lastPlayedDate: string | null;
}

export const EMPTY_STREAK: StreakSummary = {
  current: 0,
  best: 0,
  lastPlayedDate: null,
};

/** Consecutive-day runs in a sorted, de-duplicated list of date keys. */
function runsOf(keys: readonly string[]): Array<{ start: string; end: string; length: number }> {
  const runs: Array<{ start: string; end: string; length: number }> = [];

  for (const key of keys) {
    const last = runs[runs.length - 1];
    if (last && daysBetweenKeys(last.end, key) === 1) {
      last.end = key;
      last.length += 1;
      continue;
    }
    runs.push({ start: key, end: key, length: 1 });
  }

  return runs;
}

/**
 * The streak implied by the days a player finished a game on.
 *
 * Yesterday counts as still alive, matching advanceStreak in
 * frontend/lib/streak.ts: a player who played yesterday has the rest of today to
 * continue, and showing 0 to someone mid-run would be both wrong and
 * discouraging. Unparseable keys are dropped rather than breaking the count.
 */
export function computeStreak(
  playedDateKeys: readonly string[],
  todayKey: string = torontoDateKey()
): StreakSummary {
  const unique = [...new Set(playedDateKeys)]
    .filter((key) => daysBetweenKeys(key, todayKey) !== null)
    .sort();

  if (unique.length === 0) {
    return EMPTY_STREAK;
  }

  const runs = runsOf(unique);
  const best = runs.reduce((longest, run) => Math.max(longest, run.length), 0);
  const yesterdayKey = shiftDateKey(todayKey, -1);

  // The live run is the one whose last day is today or yesterday. Searched from
  // the end because that is where it is, and because a run can only qualify if it
  // is the last one.
  const liveRun = runs[runs.length - 1];
  const current =
    liveRun && (liveRun.end === todayKey || liveRun.end === yesterdayKey)
      ? liveRun.length
      : 0;

  return {
    current,
    best,
    lastPlayedDate: unique[unique.length - 1] ?? null,
  };
}
