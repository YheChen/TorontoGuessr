import Link from "next/link";
import { CalendarDays, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StreakBadge } from "@/components/streak-badge";
import { fetchHomeStats, formatCount } from "@/lib/home-stats";

/**
 * The homepage shows what the game has actually done, not what its rules are.
 *
 * It used to carry a "By the numbers" row reading "Rounds per game: 5, Max
 * points: 5000, Seconds per round: 60, Neighborhoods: 8+". Those are constants
 * from the rulebook dressed as traction, and the last one was wrong by two
 * orders of magnitude: 866 locations have been reviewed by hand. Everything
 * below comes from /stats/home.
 *
 * There is deliberately no live activity feed. Play is concentrated enough that
 * the most recent dozen finishes are often one person several times over, so a
 * "right now" list would read as a single name repeated, or as nothing during a
 * quiet hour. Lifetime totals and a score distribution are true at any hour.
 */
export default async function Home() {
  const stats = await fetchHomeStats();

  const counts = stats
    ? [
        { value: formatCount(stats.gamesPlayed), label: "games played" },
        { value: formatCount(stats.gamesFinished), label: "runs finished" },
        {
          value: formatCount(stats.locationsVerified),
          label: "locations checked by hand",
        },
        { value: formatCount(stats.perfectRuns), label: "perfect runs" },
      ]
    : [];

  // The widest band sets the bar scale, so the shape stays readable whatever
  // the distribution happens to be.
  const widestBand = stats
    ? Math.max(...stats.scoreBands.map((band) => band.count), 1)
    : 1;

  return (
    <>
      <section className="container pt-14 sm:pt-20 lg:pt-24">
        <div className="max-w-3xl">
          <StreakBadge />

          <h1 className="mt-2 text-balance text-5xl font-bold leading-[1.03] tracking-tight sm:text-6xl xl:text-[4.4rem]">
            Guess where in Toronto you are.
          </h1>

          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Five real Street View locations, picked by hand from across the
            city. Read the signage, the transit, the brick. Drop your pin.
          </p>

          <div className="mt-9 flex flex-col flex-wrap gap-3 sm:flex-row sm:items-center">
            <Button asChild size="xl" className="rounded-xl">
              <Link href="/game">
                <Play className="size-5" />
                Play a round
              </Link>
            </Button>
            <Button asChild size="xl" variant="outline" className="rounded-xl">
              <Link href="/game?mode=daily">
                <CalendarDays className="size-5" />
                Today&rsquo;s daily
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {counts.length > 0 && (
        <section className="container pt-16 sm:pt-20">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
            {counts.map((item) => (
              <div key={item.label} className="bg-card px-6 py-7">
                <dt className="sr-only">{item.label}</dt>
                <dd>
                  <span className="block font-mono-accent text-3xl font-semibold tracking-tight sm:text-4xl">
                    {item.value}
                  </span>
                  <span className="mt-2 block text-sm leading-snug text-muted-foreground">
                    {item.label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-muted-foreground">
            Every location is opened in Street View and approved by hand before
            it enters the pool.
          </p>
        </section>
      )}

      {stats && stats.gamesFinished > 0 && (
        <section className="container pt-16 sm:pt-20">
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-border pb-3">
            <h2 className="text-base font-semibold">How people score</h2>
            <p className="text-sm text-muted-foreground">
              across {formatCount(stats.gamesFinished)} finished runs
            </p>
          </div>

          <ul className="mt-5 space-y-3">
            {stats.scoreBands.map((band) => (
              <li key={band.label} className="flex items-center gap-4">
                <span className="w-28 shrink-0 text-sm text-muted-foreground sm:w-36">
                  {band.label}
                </span>
                {/* The bar needs its own track to measure against. Sized as a
                    percentage of the row instead, the widest band resolves to
                    100% of a box that still has the label and the figure beside
                    it, so it overflowed and pushed the figure off the edge. */}
                <span
                  className="h-2.5 flex-1 overflow-hidden rounded-full bg-accent"
                  aria-hidden="true"
                >
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.max((band.count / widestBand) * 100, 1.5)}%`,
                    }}
                  />
                </span>
                <span className="w-14 shrink-0 text-right font-mono-accent text-sm tabular-nums text-muted-foreground">
                  {band.percent}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats && stats.perfectPlayers.length > 0 && (
        <section className="container pt-16 sm:pt-20">
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-border pb-3">
            <h2 className="text-base font-semibold">
              Players who have gone perfect
            </h2>
            <Link
              href="/leaderboard"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Full leaderboard
            </Link>
          </div>

          {/* A list of names rather than a ranking, because a perfect run is
              25,000 exactly and hundreds of people share it: ranking them would
              be ordering ties arbitrarily. The tie is the interesting part. */}
          <ul className="mt-5 flex flex-wrap gap-2">
            {stats.perfectPlayers.slice(0, 24).map((name) => (
              <li
                key={name}
                className="rounded-lg border border-border bg-card px-3 py-1.5 font-mono-accent text-sm"
              >
                {name}
              </li>
            ))}
          </ul>

          {stats.perfectPlayers.length > 24 && (
            <p className="mt-4 text-sm text-muted-foreground">
              and {formatCount(stats.perfectPlayers.length - 24)} more who
              picked a name. Guests are not listed: a guest name is generated
              fresh each game, so it belongs to nobody.
            </p>
          )}
        </section>
      )}

      <section className="container py-16 sm:py-20">
        <div className="max-w-2xl border-l-2 border-toronto-red pl-5">
          <p className="text-pretty leading-relaxed">
            I built this to find out whether I could actually recognise my own
            city block by block. Turns out: sometimes. Every location in the
            pool is one I checked myself, because the automatically generated
            ones kept landing in ravines and parking garages.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Made in Toronto.{" "}
            <a
              href="https://github.com/YheChen"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              Source on GitHub
            </a>
          </p>
        </div>
      </section>
    </>
  );
}
