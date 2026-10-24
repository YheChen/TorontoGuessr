import { countRows, selectRows } from "./supabase.js";

/**
 * The numbers the homepage puts in front of a first-time visitor.
 *
 * Every figure here is a fact about use, or about work done. That is the point
 * of the endpoint: the page used to show the rulebook (five rounds, 5000
 * points, 60 seconds) styled as though it were traction, which tells a visitor
 * nothing and is the exact shape of a generated landing page.
 *
 * Deliberately NOT a live activity feed. Play is concentrated enough that the
 * most recent dozen finishes are routinely the same person several times over,
 * so a "right now" list reads as one name repeated, or as nothing at all during
 * a quiet hour. Totals and a distribution are true at every hour of the day.
 */

const GAME_SESSIONS_TABLE = "game_sessions";
const VERIFIED_LOCATIONS_TABLE = "verified_locations";

/** A perfect run: five rounds at the 5000-point maximum. */
export const PERFECT_SCORE = 25_000;

/**
 * Lower bounds of the score bands, ascending. Each band runs from its own bound
 * up to the next one, and the last runs from PERFECT_SCORE upward.
 */
const BAND_BOUNDS = [0, 10_000, 17_500, 22_500, PERFECT_SCORE] as const;

const BAND_LABELS = [
  "under 10k",
  "10k to 17.5k",
  "17.5k to 22.5k",
  "22.5k to 25k",
  "perfect",
] as const;

export interface ScoreBand {
  label: string;
  count: number;
  /** Share of finished games, 0 to 100, to one decimal. */
  percent: number;
}

export interface HomeStats {
  gamesPlayed: number;
  gamesFinished: number;
  locationsVerified: number;
  perfectRuns: number;
  scoreBands: ScoreBand[];
  /** Players who chose a name and have gone perfect, newest first. */
  perfectPlayers: string[];
}

/** A guest's name is random per session, so it identifies nobody. */
export function isGuestName(username: string): boolean {
  return /^guest\s*\d+$/i.test(username.trim());
}

/** Finished games scoring at least `min`. */
function countAtLeast(min: number): Promise<number> {
  return countRows(GAME_SESSIONS_TABLE, {
    filters: {
      status: "finished",
      ...(min > 0 ? { total_score: { op: "gte", value: min } } : {}),
    },
  });
}

/**
 * Turn cumulative "at least N points" counts into per-band counts.
 *
 * `cumulative[i]` is the number of finished games scoring at least
 * BAND_BOUNDS[i], so a band is the difference between its own bound and the
 * next one up, and the last band is its cumulative count as-is. The bands
 * therefore sum to the total by construction, which is the property worth
 * holding on to: a visitor reading the distribution is being told it accounts
 * for every finished game.
 */
export function computeScoreBands(
  cumulative: readonly number[],
  gamesFinished: number
): ScoreBand[] {
  return BAND_LABELS.map((label, index) => {
    const atLeastThis = cumulative[index] ?? 0;
    const atLeastNext = cumulative[index + 1] ?? 0;
    const count =
      index === BAND_LABELS.length - 1
        ? atLeastThis
        : Math.max(0, atLeastThis - atLeastNext);
    return {
      label,
      count,
      percent:
        gamesFinished > 0 ? Math.round((count / gamesFinished) * 1000) / 10 : 0,
    };
  });
}

/** Named players, newest first, each appearing once. Guests are dropped. */
export function dedupeNamedPlayers(
  rows: ReadonlyArray<{ username: string | null }>
): string[] {
  const players: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const name = row.username?.trim();
    if (!name || isGuestName(name) || seen.has(name)) {
      continue;
    }
    seen.add(name);
    players.push(name);
  }
  return players;
}

export async function getHomeStats(): Promise<HomeStats> {
  // Bands are differences between cumulative counts rather than one query per
  // range, because a filter map holds one entry per column, so a single query
  // cannot express both a lower and an upper bound. Counting upward and
  // subtracting needs only `gte`, and it is exact: bucketing the rows in JS
  // would hit PostgREST's 1000-row cap and silently describe the newest slice
  // of games rather than all of them.
  const [
    gamesPlayed,
    locationsVerified,
    cumulative,
    perfectRows,
  ] = await Promise.all([
    countRows(GAME_SESSIONS_TABLE),
    countRows(VERIFIED_LOCATIONS_TABLE, {
      filters: { manually_verified: true },
    }),
    Promise.all(BAND_BOUNDS.map((bound) => countAtLeast(bound))),
    selectRows<{ username: string | null }>(GAME_SESSIONS_TABLE, {
      columns: "username,completed_at",
      filters: { status: "finished", total_score: PERFECT_SCORE },
      order: "completed_at.desc",
      limit: 1000,
    }),
  ]);

  const gamesFinished = cumulative[0] ?? 0;
  const perfectRuns = cumulative[cumulative.length - 1] ?? 0;
  const scoreBands = computeScoreBands(cumulative, gamesFinished);
  const perfectPlayers = dedupeNamedPlayers(perfectRows);

  return {
    gamesPlayed,
    gamesFinished,
    locationsVerified,
    perfectRuns,
    scoreBands,
    perfectPlayers,
  };
}
