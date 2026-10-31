import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StreakBadge } from "@/components/streak-badge";
import { ActivityChart } from "@/components/site/activity-chart";
import { resolveApiBaseUrl } from "@/lib/api-base-url";
import { formatDay } from "@/lib/date-toronto";
import { loadHomeStats, type HomeStats } from "@/lib/home-stats";

// Rebuilt at most every five minutes, so the numbers stay current without a
// stats request per visitor. Next only reads a literal here; keep it equal to
// HOME_STATS_REVALIDATE_SECONDS.
export const revalidate = 300;

const REPO_URL = "https://github.com/YheChen/TorontoGuessr";
const AUTHOR_URL = "https://github.com/YheChen";

const MODES = [
  {
    title: "Classic",
    description: "Five random spots. Play as many games as you like.",
    action: "Play",
    href: "/game",
  },
  {
    title: "Daily challenge",
    description:
      "The same five spots for everyone, new at midnight Toronto time. One attempt a day.",
    action: "Play today's",
    href: "/game?mode=daily",
  },
  {
    title: "With friends",
    description:
      "Open a room and everyone guesses the same rounds at once. Or finish any game and send the link: your friend gets your exact five rounds.",
    action: "Open a room",
    href: "/lobby",
  },
] as const;

const ROUND_STEPS = [
  {
    title: "Look around",
    body: "You land in a Street View panorama somewhere between roughly Bathurst and the Don, from the lake up to Dupont. Pan and zoom as much as you like.",
  },
  {
    title: "Drop a pin",
    body: "Click the map where you think you're standing, and move the pin as often as you want. When the sixty seconds run out, wherever it sits is your guess.",
  },
  {
    title: "Score on distance",
    body: "Within 100 m is a perfect 5,000. A kilometre off pays 2,762. Miss by the width of downtown and you get a few hundred.",
  },
] as const;

const count = (value: number) => value.toLocaleString("en-US");

/** "Apr 7, 2026" for a "YYYY-MM-DD" key. */
const dayWithYear = (date: string) => `${formatDay(date)}, ${date.slice(0, 4)}`;

const updatedAt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Toronto",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

const linkClass =
  "font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground";

export default async function Home() {
  const stats = await loadHomeStats();

  return (
    <>
      <section className="container pt-12 sm:pt-16 lg:pt-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-end lg:gap-16">
          <div>
            <h1 className="max-w-3xl text-balance text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl xl:text-7xl">
              How well do you know Toronto?
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
              Every round drops you onto a real Street View panorama somewhere
              downtown, with sixty seconds on the clock. Read the street signs,
              the storefronts and the streetcar tracks, then pin where you think
              you&apos;re standing. Five rounds, up to 5,000 points each.
            </p>

            {/* Stacked full width on phones; side by side, wrapping, from sm.
                The wrap matters: a grid item can't shrink below its
                min-content, and non-wrapping buttons once pushed this column
                wide enough to scroll the page sideways. */}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="xl" className="rounded-xl">
                <Link href="/game">
                  <Play className="size-5" />
                  Play now
                </Link>
              </Button>
              <Button asChild size="xl" variant="outline" className="rounded-xl">
                <Link href="/game?mode=daily">Today&apos;s daily challenge</Link>
              </Button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <p>
                Free, and no account needed. Or{" "}
                <Link href="/lobby" className={linkClass}>
                  play with friends
                </Link>{" "}
                in a private room.
              </p>
              {/* Client island: the streak lives in localStorage. Renders
                  nothing without a live streak. */}
              <StreakBadge />
            </div>
          </div>

          {stats && <HeroNumbers stats={stats} />}
        </div>
      </section>

      <figure className="container mt-14 sm:mt-20">
        {/* A plain img with a hand-written srcSet: images are unoptimized in
            next.config, so next/image would add nothing here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/gameplay-1400.webp"
          srcSet="/gameplay-800.webp 800w, /gameplay-1400.webp 1400w, /gameplay-2400.webp 2400w"
          sizes="(min-width: 1280px) 1240px, calc(100vw - 2.5rem)"
          width={2400}
          height={1331}
          fetchPriority="high"
          alt="A round in progress: a Street View panorama of a downtown corner with a Jarvis St sign, condo towers and rowhouses, and the guess map with a pin placed."
          className="h-auto w-full"
        />
        <figcaption className="mt-3 text-sm text-muted-foreground">
          A real round, mid-guess. The Jarvis St sign makes this one easy; most
          rounds don&apos;t hand you a street name.
        </figcaption>
      </figure>

      {stats && <ActivitySection stats={stats} />}

      <section
        aria-labelledby="round-heading"
        className="container mt-24 sm:mt-32"
      >
        <h2
          id="round-heading"
          className="text-3xl font-bold tracking-tight sm:text-4xl"
        >
          How a round works
        </h2>
        <div className="mt-8 grid gap-x-12 gap-y-8 border-t border-border pt-8 md:grid-cols-3">
          {ROUND_STEPS.map((step) => (
            <div key={step.title}>
              <h3 className="text-base font-semibold">{step.title}</h3>
              <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="modes-heading"
        className="container mt-24 pb-24 sm:mt-32 sm:pb-32"
      >
        <h2
          id="modes-heading"
          className="text-3xl font-bold tracking-tight sm:text-4xl"
        >
          Ways to play
        </h2>
        <ul className="mt-8 divide-y divide-border border-y border-border">
          {MODES.map((mode) => (
            <li key={mode.title}>
              <Link
                href={mode.href}
                className="group grid gap-x-8 gap-y-1.5 py-6 sm:grid-cols-[13rem_minmax(0,1fr)_auto] sm:items-baseline"
              >
                <span className="text-lg font-semibold transition-colors group-hover:text-primary">
                  {mode.title}
                </span>
                <span className="text-pretty text-muted-foreground">
                  {mode.description}
                </span>
                <span className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-primary sm:mt-0">
                  {mode.action}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-muted-foreground">
          Built and run by{" "}
          <a href={AUTHOR_URL} className={linkClass}>
            Yanzhen Chen
          </a>{" "}
          in Toronto. The code is{" "}
          <a href={REPO_URL} className={linkClass}>
            on GitHub
          </a>
          .
        </p>
      </section>
    </>
  );
}

function HeroNumbers({ stats }: { stats: HomeStats }) {
  const facts = [
    {
      value: count(stats.gamesStarted),
      label: `games started since ${dayWithYear(stats.days[0].date)}`,
    },
    {
      value: count(stats.gamesStartedLast30Days),
      label: "in the last 30 days",
    },
    {
      value: count(stats.gamesFinished),
      label: "played through all five rounds",
    },
  ];

  return (
    <dl className="grid grid-cols-3 gap-4 border-t border-border pt-6 lg:grid-cols-1 lg:gap-0 lg:divide-y lg:divide-border lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
      {facts.map((fact) => (
        <div
          key={fact.label}
          className="flex flex-col gap-1 lg:py-5 lg:first:pt-0 lg:last:pb-0"
        >
          <dt className="text-pretty text-xs leading-snug text-muted-foreground sm:text-sm">
            {fact.label}
          </dt>
          {/* Shown above its label but kept after it in the markup, where a
              dl wants it. */}
          <dd className="order-first text-2xl font-semibold tracking-tight tabular sm:text-3xl lg:text-4xl">
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ActivitySection({ stats }: { stats: HomeStats }) {
  const firstDay = stats.days[0].date;
  const heading =
    stats.daysWithPlay === stats.days.length
      ? `Played every day since ${formatDay(firstDay)}`
      : `Played on ${count(stats.daysWithPlay)} of the last ${count(stats.days.length)} days`;
  const apiBaseUrl = resolveApiBaseUrl();

  return (
    <section
      aria-labelledby="activity-heading"
      className="container mt-24 sm:mt-32"
    >
      <div className="grid gap-10 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-16">
        <div>
          <h2
            id="activity-heading"
            className="text-balance text-3xl font-bold tracking-tight sm:text-4xl"
          >
            {heading}
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            Each bar is a day. The solid part is games played to the end; the
            faint part, games started and abandoned. These count games, not
            people, because guests aren&apos;t tracked.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Updated {updatedAt.format(new Date(stats.generatedAt))}
            {apiBaseUrl && (
              <>
                {" "}
                from the{" "}
                <a href={`${apiBaseUrl}/stats/games`} className={linkClass}>
                  public stats API
                </a>
              </>
            )}
            .{" "}
            <Link href="/stats" className={linkClass}>
              More stats
            </Link>
          </p>
        </div>

        <ActivityChart days={stats.days} busiestDay={stats.busiestDay} />
      </div>
    </section>
  );
}
