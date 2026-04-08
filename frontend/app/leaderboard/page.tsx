"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { fetchLeaderboard } from "@/lib/api";
import type { LeaderboardEntry, LeaderboardPeriod } from "@/lib/types";

const LEADERBOARD_OPTIONS: Array<{
  value: LeaderboardPeriod;
  label: string;
  description: string;
}> = [
  {
    value: "lifetime",
    label: "Lifetime",
    description: "Best scores across every finished game",
  },
  {
    value: "daily",
    label: "Daily",
    description: "Best scores from the last 24 hours",
  },
  {
    value: "weekly",
    label: "Weekly",
    description: "Best scores from the last 7 days",
  },
  {
    value: "monthly",
    label: "Monthly",
    description: "Best scores from the last 30 days",
  },
];

const completedAtFormatter = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short",
});

function getRankStyles(index: number) {
  if (index === 0) {
    return "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/15 dark:text-amber-100";
  }

  if (index === 1) {
    return "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-400/40 dark:bg-slate-500/15 dark:text-slate-100";
  }

  if (index === 2) {
    return "border-orange-300 bg-orange-100 text-orange-900 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-100";
  }

  return "border-border bg-secondary text-secondary-foreground";
}

export default function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [period, setPeriod] = useState<LeaderboardPeriod>("lifetime");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadLeaderboard = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const nextEntries = await fetchLeaderboard(period);
        if (!isCancelled) {
          setEntries(nextEntries);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not load leaderboard data.";
        if (!isCancelled) {
          setErrorMessage(message);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadLeaderboard();

    return () => {
      isCancelled = true;
    };
  }, [period]);

  const activeOption = LEADERBOARD_OPTIONS.find(
    (option) => option.value === period
  )!;
  const topEntry = entries[0] ?? null;

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground dark:bg-gray-900">
      <Header />
      <div className="container mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.12em] text-primary">
              Toronto Records
            </p>
            <h1 className="mt-2 text-3xl font-bold">Leaderboard</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {activeOption.description}
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-card/85 px-4 py-3 text-sm shadow-sm shadow-sky-950/5 backdrop-blur dark:bg-gray-800 dark:shadow-none">
            Showing {entries.length} score{entries.length === 1 ? "" : "s"} for{" "}
            {activeOption.label.toLowerCase()} play.
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {LEADERBOARD_OPTIONS.map((option) => {
            const isActive = option.value === period;

            return (
              <Button
                key={option.value}
                variant="outline"
                onClick={() => setPeriod(option.value)}
                className={
                  isActive
                    ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground dark:border-[#003566] dark:bg-[#003566] dark:text-white dark:hover:bg-[#003566] dark:hover:text-white"
                    : "border-border bg-card/85 text-foreground hover:bg-accent hover:text-accent-foreground dark:border-white/20 dark:bg-[#001845] dark:text-white dark:hover:bg-[#00205B] dark:hover:text-white"
                }
              >
                {option.label}
              </Button>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr,1.8fr]">
          <section className="rounded-lg border border-border/70 bg-card/90 p-6 shadow-lg shadow-sky-950/5 backdrop-blur dark:bg-gray-800 dark:shadow-none">
            <div className="flex items-center gap-2 text-primary dark:text-white">
              <Trophy className="h-5 w-5" />
              <p className="text-sm font-semibold uppercase tracking-[0.12em]">
                Current Leader
              </p>
            </div>

            {topEntry ? (
              <div className="mt-5 space-y-5">
                <div>
                  <p className="text-lg font-semibold">{topEntry.username}</p>
                  <p className="text-4xl font-bold">{topEntry.totalScore}</p>
                  <p className="mt-1 text-sm text-muted-foreground">points</p>
                </div>
                <div className="rounded-lg bg-secondary p-4 text-secondary-foreground dark:bg-gray-700 dark:text-gray-300">
                  <p className="text-sm font-medium">
                    Completed {topEntry.roundsPlayed} rounds on{" "}
                    {completedAtFormatter.format(new Date(topEntry.completedAt))}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">
                No completed games in this range yet.
              </p>
            )}
          </section>

          <section className="rounded-lg border border-border/70 bg-card/90 p-6 shadow-lg shadow-sky-950/5 backdrop-blur dark:bg-gray-800 dark:shadow-none">
          {isLoading && (
            <p className="my-8 text-center text-muted-foreground">
              Loading scores...
            </p>
          )}

          {!isLoading && errorMessage && (
            <p className="my-8 text-center text-red-500">{errorMessage}</p>
          )}

          {!isLoading && !errorMessage && entries.length === 0 && (
            <p className="my-8 text-center text-muted-foreground">
              No completed games yet for {activeOption.label.toLowerCase()} play.
            </p>
          )}

          {!isLoading && !errorMessage && entries.length > 0 && (
            <div className="space-y-3">
              {entries.map((entry, index) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-4 py-4 dark:border-white/10 dark:bg-[#001845]"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm font-bold ${getRankStyles(
                        index
                      )}`}
                    >
                      #{index + 1}
                    </div>
                    <div>
                      <p className="font-medium">
                        {entry.username}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {index === 0 ? "Top score" : `${activeOption.label} contender`}{" "}
                        · Completed{" "}
                        {completedAtFormatter.format(new Date(entry.completedAt))}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{entry.totalScore} points</p>
                    <p className="text-sm text-muted-foreground">
                      {entry.roundsPlayed} rounds
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          </section>
        </div>
      </div>
    </main>
  );
}
