// Toronto-timezone date helpers shared by the stats dashboard (and available
// to any client feature that needs a consistent America/Toronto calendar day).

/** The game launched April 1, 2026; "All time" spans from that date. */
export const LAUNCH_DATE_UTC = Date.UTC(2026, 3, 1);
export const API_MAX_DAYS = 3650;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/**
 * Days from launch through today in Toronto time, inclusive, clamped to the
 * API's accepted range. `now` is injectable for deterministic tests.
 */
export function daysSinceLaunch(now: Date = new Date()): number {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month, day] = today.split("-").map(Number);
  if (!year || !month || !day) {
    return 90;
  }

  const todayUtc = Date.UTC(year, month - 1, day);
  const elapsed = Math.floor((todayUtc - LAUNCH_DATE_UTC) / MS_PER_DAY) + 1;
  return Math.min(Math.max(elapsed, 1), API_MAX_DAYS);
}

/**
 * Format a "YYYY-MM-DD" key without going through Date, which would parse it
 * as UTC midnight and shift the day in negative-offset time zones.
 */
export function formatDay(value: string): string {
  const [, month, day] = value.split("-");
  const monthLabel = MONTHS[Number(month) - 1];
  if (!monthLabel || !day) {
    return value;
  }
  return `${monthLabel} ${Number(day)}`;
}
