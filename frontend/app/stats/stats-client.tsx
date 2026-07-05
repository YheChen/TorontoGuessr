"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  Flag,
  Percent,
  Play,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/site/stat-card";
import { LoadingScreen, ErrorCard, EmptyState } from "@/components/site/states";
import { cn } from "@/lib/utils";
import { fetchGameStats } from "@/lib/api";
import type { GameStatsResponse } from "@/lib/types";

// "All time" uses the API's maximum window of 365 days.
const RANGE_OPTIONS = [
  { days: 1, label: "24 hours" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 365, label: "All time" },
] as const;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const chartConfig = {
  gamesStarted: {
    label: "Games started",
    color: "hsl(var(--toronto-azure))",
  },
  gamesFinished: {
    label: "Games finished",
    color: "hsl(var(--success))",
  },
} satisfies ChartConfig;

/**
 * Format a "YYYY-MM-DD" key without going through Date, which would parse it
 * as UTC midnight and shift the day in negative-offset time zones.
 */
function formatDay(value: string): string {
  const [, month, day] = value.split("-");
  const monthLabel = MONTHS[Number(month) - 1];
  if (!monthLabel || !day) {
    return value;
  }
  return `${monthLabel} ${Number(day)}`;
}

export function StatsClient() {
  const [days, setDays] = useState<number>(30);
  const [stats, setStats] = useState<GameStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isCancelled = false;

    const load = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetchGameStats(days);
        if (!isCancelled) {
          setStats(response);
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Could not load game statistics.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      isCancelled = true;
    };
  }, [days, reloadKey]);

  const totals = stats?.totals ?? { gamesStarted: 0, gamesFinished: 0 };
  const completionRate =
    totals.gamesStarted === 0
      ? 0
      : Math.round((totals.gamesFinished / totals.gamesStarted) * 100);

  const busiestDay = (stats?.series ?? []).reduce<
    { date: string; gamesStarted: number } | null
  >(
    (best, entry) =>
      entry.gamesStarted > (best?.gamesStarted ?? 0) ? entry : best,
    null,
  );

  const hasActivity = totals.gamesStarted > 0;

  return (
    <section className="container py-10 sm:py-14">
      {/* Header */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            <BarChart3 className="size-3.5" />
            Statistics
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            How Toronto plays
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-muted-foreground">
            Live gameplay activity: games started and finished each day, all
            times in {stats?.timeZone ?? "America/Toronto"}.
          </p>
        </div>

        {/* Range segmented control */}
        <div className="-mx-1 overflow-x-auto px-1 pb-1 sm:self-auto">
          <div className="inline-flex rounded-full border border-border/70 bg-muted/60 p-1 backdrop-blur">
          {RANGE_OPTIONS.map((option) => {
            const isActive = option.days === days;
            return (
              <button
                key={option.days}
                type="button"
                onClick={() => setDays(option.days)}
                aria-pressed={isActive}
                className={cn(
                  "whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-card text-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            );
          })}
          </div>
        </div>
      </div>

      <div className="mt-8">
        {isLoading && (
          <LoadingScreen
            title="Loading statistics…"
            description="Aggregating recent games."
          />
        )}

        {!isLoading && errorMessage && (
          <ErrorCard
            title="Couldn't load statistics"
            message={errorMessage}
            onRetry={() => setReloadKey((key) => key + 1)}
          />
        )}

        {!isLoading && !errorMessage && stats && (
          <div className="space-y-6">
            {/* Stat tiles */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                icon={Play}
                label="Games started"
                value={totals.gamesStarted}
              />
              <StatCard
                icon={Flag}
                label="Games finished"
                value={totals.gamesFinished}
              />
              <StatCard
                icon={Percent}
                label="Completion rate"
                value={completionRate}
                suffix="%"
              />
              <StatCard
                icon={CalendarDays}
                label="Busiest day"
                value={0}
                display={busiestDay ? formatDay(busiestDay.date) : "No games"}
              />
            </div>

            {/* Daily activity chart */}
            <div className="surface-card rounded-2xl p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">
                    Daily activity
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {stats.rangeStart && stats.rangeEnd
                      ? stats.rangeStart === stats.rangeEnd
                        ? formatDay(stats.rangeStart)
                        : `${formatDay(stats.rangeStart)} to ${formatDay(stats.rangeEnd)}`
                      : `Last ${stats.days} days`}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="size-2.5 rounded-full bg-toronto-azure"
                      aria-hidden="true"
                    />
                    Started
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="size-2.5 rounded-full bg-success"
                      aria-hidden="true"
                    />
                    Finished
                  </span>
                </div>
              </div>

              {hasActivity ? (
                <ChartContainer
                  config={chartConfig}
                  className="mt-6 aspect-auto h-[300px] w-full"
                >
                  <AreaChart
                    data={stats.series}
                    margin={{ top: 8, left: 0, right: 8, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="fillStarted"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="var(--color-gamesStarted)"
                          stopOpacity={0.32}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--color-gamesStarted)"
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                      <linearGradient
                        id="fillFinished"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="var(--color-gamesFinished)"
                          stopOpacity={0.32}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--color-gamesFinished)"
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={10}
                      minTickGap={32}
                      tickFormatter={formatDay}
                    />
                    <YAxis
                      width={36}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          labelFormatter={(value) => formatDay(String(value))}
                        />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="gamesStarted"
                      stroke="var(--color-gamesStarted)"
                      strokeWidth={2}
                      fill="url(#fillStarted)"
                      dot={stats.series.length <= 2}
                    />
                    <Area
                      type="monotone"
                      dataKey="gamesFinished"
                      stroke="var(--color-gamesFinished)"
                      strokeWidth={2}
                      fill="url(#fillFinished)"
                      dot={stats.series.length <= 2}
                    />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <EmptyState
                  icon={BarChart3}
                  title="No games in this range yet"
                  description="Start a game and it will show up here within moments."
                  action={
                    <Button asChild className="mt-1 rounded-xl">
                      <Link href="/game">
                        <Play className="size-4" />
                        Play now
                      </Link>
                    </Button>
                  }
                  className="mt-6"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
