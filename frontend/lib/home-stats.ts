import { resolveApiBaseUrl } from "@/lib/api-base-url";
import {
  dateKeyToUtc,
  daysSinceLaunch,
  formatMonth,
} from "@/lib/date-toronto";
import type { DailyGameStatsEntry, GameStatsResponse } from "@/lib/types";

/**
 * How long the landing page reuses one set of numbers, in seconds. app/page.tsx
 * exports the same value as `revalidate`, which Next needs as a literal there.
 */
export const HOME_STATS_REVALIDATE_SECONDS = 300;

/** Long enough for a cold function, short enough not to stall a render. */
const FETCH_TIMEOUT_MS = 5_000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A month label is dropped when the series starts this close to the next month,
 * so "Apr" and "May" never print on top of each other.
 */
const MIN_DAYS_FOR_PARTIAL_MONTH_LABEL = 10;

export interface HomeStats {
  /**
   * One entry per day, oldest first, from the first recorded game through the
   * last day the API reported. Days the API skipped are filled in as zero.
   */
  days: DailyGameStatsEntry[];
  gamesStarted: number;
  gamesFinished: number;
  /** Games started over the last 30 days, the latest day included. */
  gamesStartedLast30Days: number;
  /** How many of `days` saw at least one game started. */
  daysWithPlay: number;
  busiestDay: DailyGameStatsEntry;
  /** When the backend computed the figures, as an ISO timestamp. */
  generatedAt: string;
}

/**
 * Reduce the stats endpoint's response to what the landing page shows.
 *
 * The chart starts at the first game rather than at launch: the days between
 * launch and the first game are zeros that say nothing about how often people
 * play, and they would count against "days with play". Null when nobody has
 * played at all, which the page treats the same as having no numbers.
 */
export function summarizeGameStats(
  stats: GameStatsResponse,
): HomeStats | null {
  const byDate = new Map(stats.series.map((entry) => [entry.date, entry]));
  const dates = [...byDate.keys()].sort();
  const firstPlayed = dates.find(
    (date) => (byDate.get(date)?.gamesStarted ?? 0) > 0,
  );
  const start = firstPlayed ? dateKeyToUtc(firstPlayed) : null;
  const end = dateKeyToUtc(dates.at(-1) ?? "");
  if (start === null || end === null) {
    return null;
  }

  const days: DailyGameStatsEntry[] = [];
  for (let time = start; time <= end; time += MS_PER_DAY) {
    const date = new Date(time).toISOString().slice(0, 10);
    days.push(byDate.get(date) ?? { date, gamesStarted: 0, gamesFinished: 0 });
  }

  const busiestDay = days.reduce((best, day) =>
    day.gamesStarted > best.gamesStarted ? day : best,
  );

  return {
    days,
    gamesStarted: stats.totals.gamesStarted,
    gamesFinished: stats.totals.gamesFinished,
    gamesStartedLast30Days: days
      .slice(-30)
      .reduce((sum, day) => sum + day.gamesStarted, 0),
    daysWithPlay: days.filter((day) => day.gamesStarted > 0).length,
    busiestDay,
    generatedAt: stats.generatedAt,
  };
}

export interface MonthTick {
  /** Index into the days array where the label sits. */
  index: number;
  label: string;
}

/**
 * Where to label months along the chart's axis.
 *
 * Each month is labelled on its first day. The opening partial month is
 * labelled on the series' first day, unless the next month starts too soon
 * after it for both labels to fit. January carries its year so the axis is
 * never ambiguous once the chart spans a new year.
 */
export function monthTicks(days: DailyGameStatsEntry[]): MonthTick[] {
  const ticks = days.flatMap((day, index) =>
    day.date.endsWith("-01")
      ? [{ index, label: formatMonth(day.date, day.date.slice(5, 7) === "01") }]
      : [],
  );

  const firstDay = days[0];
  const firstMonthStart = ticks[0]?.index ?? Number.POSITIVE_INFINITY;
  if (
    firstDay &&
    firstMonthStart !== 0 &&
    firstMonthStart >= MIN_DAYS_FOR_PARTIAL_MONTH_LABEL
  ) {
    ticks.unshift({ index: 0, label: formatMonth(firstDay.date) });
  }

  return ticks;
}

function isGameStatsResponse(value: unknown): value is GameStatsResponse {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<GameStatsResponse>;
  return (
    Array.isArray(candidate.series) &&
    typeof candidate.totals?.gamesStarted === "number" &&
    typeof candidate.totals?.gamesFinished === "number" &&
    typeof candidate.generatedAt === "string"
  );
}

/**
 * Live play counts for the landing page, or null when they can't be had.
 *
 * Never throws. The landing page has to render with the backend down or
 * unconfigured, and a page without its numbers beats no page; the next
 * revalidation brings them back.
 */
export async function loadHomeStats(): Promise<HomeStats | null> {
  const baseUrl = resolveApiBaseUrl();
  if (!baseUrl) {
    return null;
  }

  try {
    // The same `days` the stats page asks for under "All time", so both pages
    // share one CDN entry for the response.
    const response = await fetch(
      `${baseUrl}/stats/games?days=${daysSinceLaunch()}`,
      {
        next: { revalidate: HOME_STATS_REVALIDATE_SECONDS },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      console.warn(`[home-stats] stats request failed with ${response.status}`);
      return null;
    }

    const body: unknown = await response.json();
    if (!isGameStatsResponse(body)) {
      console.warn("[home-stats] stats response had an unexpected shape");
      return null;
    }
    return summarizeGameStats(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[home-stats] stats unavailable: ${message}`);
    return null;
  }
}
