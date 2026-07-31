/**
 * Toronto calendar-day helpers.
 *
 * Deliberately the same rules as frontend/lib/date-toronto.ts, and the
 * duplication is not laziness: the two packages do not share a module, and a
 * streak computed on the server has to agree with one displayed on the client
 * about when a day ended, or a player watches their run reset at a moment that
 * matches nothing they can see. tests/date-toronto.test.ts asserts the two agree
 * across a DST boundary in both directions, which is where they would drift.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const TORONTO_TIME_ZONE = "America/Toronto";

/**
 * A moment's calendar day in Toronto as "YYYY-MM-DD".
 *
 * en-CA already formats that way, so no part reassembly is needed. Toronto
 * rather than UTC because a game finished at 8pm Toronto belongs to that day for
 * the player, and UTC would have already rolled over.
 */
export function torontoDateKey(value: string | number | Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

/**
 * UTC midnight of a "YYYY-MM-DD" key, or null when it is not one.
 *
 * Comparing days through UTC midnight rather than through local Date parsing
 * keeps arithmetic free of offset drift: the difference between two of these is
 * always a whole number of days, DST included, because neither carries a time.
 */
export function dateKeyToUtc(key: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day));
  // Rejects 2026-02-30 and friends, which Date.UTC would silently roll forward
  // into March and quietly shift a streak by a day.
  return torontoKeyFromUtcMidnight(utc) === key ? utc : null;
}

/** The "YYYY-MM-DD" a UTC midnight represents, without any zone conversion. */
function torontoKeyFromUtcMidnight(utc: number): string {
  const date = new Date(utc);
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Whole days from `fromKey` to `toKey`; null when either is unparseable. */
export function daysBetweenKeys(fromKey: string, toKey: string): number | null {
  const from = dateKeyToUtc(fromKey);
  const to = dateKeyToUtc(toKey);
  if (from === null || to === null) {
    return null;
  }
  return Math.round((to - from) / MS_PER_DAY);
}

/** The key `days` before `key`, or null when `key` is unparseable. */
export function shiftDateKey(key: string, days: number): string | null {
  const utc = dateKeyToUtc(key);
  if (utc === null) {
    return null;
  }
  return torontoKeyFromUtcMidnight(utc + days * MS_PER_DAY);
}
