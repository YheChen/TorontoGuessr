/**
 * Homepage figures, fetched on the server.
 *
 * Separate from lib/api.ts because that module's `request` helper is built for
 * the browser: it reads the Supabase session and refreshes expired tokens. The
 * homepage is a server component and needs neither, but does need Next's
 * revalidate hint, which `request` has no way to pass through.
 */

export interface ScoreBand {
  label: string;
  count: number;
  percent: number;
}

export interface HomeStats {
  gamesPlayed: number;
  gamesFinished: number;
  locationsVerified: number;
  perfectRuns: number;
  scoreBands: ScoreBand[];
  perfectPlayers: string[];
}

/**
 * How long a rendered homepage may serve stale figures. These are lifetime
 * totals that move by single digits an hour, so the page is regenerated every
 * five minutes rather than queried per visitor.
 */
const REVALIDATE_SECONDS = 300;

/**
 * Returns null rather than throwing. The homepage has to render for someone who
 * has never seen it even when the API is down, so every figure is optional at
 * the call site and the page simply drops those sections.
 */
export async function fetchHomeStats(): Promise<HomeStats | null> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) {
    return null;
  }

  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/stats/home`, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as HomeStats;
  } catch {
    return null;
  }
}

/** 6960 -> "6,960". Grouping is what makes a count read as a real total. */
export function formatCount(value: number): string {
  return value.toLocaleString("en-CA");
}
