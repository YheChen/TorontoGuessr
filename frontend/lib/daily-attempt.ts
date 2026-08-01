import { torontoDateKey } from "@/lib/date-toronto";

/**
 * One daily-challenge attempt per player per day, client side.
 *
 * The real enforcement is a unique index in the database
 * (backend/supabase/add_daily_attempt_key.sql), because a check the client makes
 * is a check the client can skip. What this adds is the difference between a
 * player being told "you have already played today" before anything happens, and
 * a player watching a game start and then getting a 409.
 *
 * WHY THE DAILY NEEDS THIS AT ALL. Every player gets the same five locations for a
 * date, and a guess response has to return that round's answer so the result can be
 * drawn on the map. So one honest play reveals all five answers, and before this an
 * unlimited restart meant a notepad was enough to post 25,000.
 */

const CLIENT_ID_KEY = "tg_client_id";
const DAILY_PLAYED_KEY = "tg_daily_played";

/**
 * This browser's own random id, created on first use.
 *
 * First-party, random, and used for exactly one thing: letting the server notice
 * two attempts at the same day's challenge from the same browser. It is hashed
 * together with the date before being stored server side, so it cannot be used to
 * follow anyone from one day to the next.
 */
export function getClientId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const existing = window.localStorage.getItem(CLIENT_ID_KEY);
    if (existing && existing.length <= 100) {
      return existing;
    }
    const created = crypto.randomUUID();
    window.localStorage.setItem(CLIENT_ID_KEY, created);
    return created;
  } catch {
    // Storage blocked. The player is simply not deduplicated, which is better
    // than being unable to play at all; the migration documents that tradeoff.
    return null;
  }
}

/** The Toronto date this browser last played the daily on, or null. */
export function readDailyPlayed(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const value = window.localStorage.getItem(DAILY_PLAYED_KEY);
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Whether today's daily has already been started in this browser.
 *
 * Compared on the Toronto calendar, the same boundary the challenge date itself
 * uses, so the answer cannot disagree with the server about which day it is.
 */
export function hasPlayedDailyToday(now: Date = new Date()): boolean {
  const played = readDailyPlayed();
  return played !== null && played === torontoDateKey(now);
}

/**
 * Record that today's daily has been started.
 *
 * Recorded at START, not at finish, and that is deliberate: abandoning a daily
 * half way still burns the attempt, because the answers to the rounds already seen
 * are already out. Finishing it later is not what the guard is protecting.
 */
export function markDailyPlayed(now: Date = new Date()): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(DAILY_PLAYED_KEY, torontoDateKey(now));
  } catch {
    // Nothing to do; the server's index is still there.
  }
}
