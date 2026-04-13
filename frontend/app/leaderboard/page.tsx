"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import { fetchLeaderboard } from "@/lib/api";
import type {
  LeaderboardEntry,
  LeaderboardPeriod,
  LeaderboardResponse,
} from "@/lib/types";

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
const PREVIEW_LIMIT = 5;
const PAGINATED_LIMIT = 10;

function getPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items: Array<number | "start-ellipsis" | "end-ellipsis"> = [1];
  const startPage = Math.max(2, currentPage - 1);
  const endPage = Math.min(totalPages - 1, currentPage + 1);

  if (startPage > 2) {
    items.push("start-ellipsis");
  }

  for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
    items.push(pageNumber);
  }

  if (endPage < totalPages - 1) {
    items.push("end-ellipsis");
  }

  items.push(totalPages);
  return items;
}

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
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [leaderEntry, setLeaderEntry] = useState<LeaderboardEntry | null>(null);
  const [period, setPeriod] = useState<LeaderboardPeriod>("lifetime");
  const [page, setPage] = useState(1);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const currentLimit = isExpanded ? PAGINATED_LIMIT : PREVIEW_LIMIT;

  useEffect(() => {
    let isCancelled = false;

    const loadLeaderboard = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const nextLeaderboard = await fetchLeaderboard(period, {
          page,
          limit: currentLimit,
        });
        if (!isCancelled) {
          setLeaderboard(nextLeaderboard);
          if (page === 1) {
            setLeaderEntry(nextLeaderboard.entries[0] ?? null);
          }
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
  }, [currentLimit, page, period]);

  const handlePeriodChange = (nextPeriod: LeaderboardPeriod) => {
    setPeriod(nextPeriod);
    setPage(1);
    setIsExpanded(false);
    setLeaderboard(null);
    setLeaderEntry(null);
  };

  const activeOption = LEADERBOARD_OPTIONS.find(
    (option) => option.value === period
  )!;
  const entries = leaderboard?.entries ?? [];
  const topEntry = leaderEntry;
  const totalEntries = leaderboard?.total ?? 0;
  const totalPages = leaderboard?.totalPages ?? 1;
  const currentPage = leaderboard?.page ?? page;
  const currentPageSize = leaderboard?.limit ?? currentLimit;
  const rankOffset = (currentPage - 1) * currentPageSize;
  const showingFrom = totalEntries === 0 ? 0 : rankOffset + 1;
  const showingTo = totalEntries === 0 ? 0 : rankOffset + entries.length;
  const paginationItems = getPaginationItems(currentPage, totalPages);
  const showMoreAvailable =
    !isLoading && !errorMessage && !isExpanded && totalEntries > PREVIEW_LIMIT;
  const summaryText = isLoading
    ? `Loading ${activeOption.label.toLowerCase()} scores...`
    : !isExpanded
      ? `Showing top ${entries.length} of ${totalEntries} score${
          totalEntries === 1 ? "" : "s"
        } for ${activeOption.label.toLowerCase()} play.`
      : `Showing ${showingFrom}-${showingTo} of ${totalEntries} score${
          totalEntries === 1 ? "" : "s"
        } for ${activeOption.label.toLowerCase()} play.`;

  return (
    <main className="flex flex-1 flex-col bg-background text-foreground dark:bg-gray-900">
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
            {summaryText}
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {LEADERBOARD_OPTIONS.map((option) => {
            const isActive = option.value === period;

            return (
              <Button
                key={option.value}
                variant="outline"
                onClick={() => handlePeriodChange(option.value)}
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
              {entries.map((entry, index) => {
                const rank = rankOffset + index + 1;

                return (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-4 py-4 dark:border-white/10 dark:bg-[#001845]"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm font-bold ${getRankStyles(
                        rank - 1
                      )}`}
                    >
                      #{rank}
                    </div>
                    <div>
                      <p className="font-medium">
                        {entry.username}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {rank === 1
                          ? "Top score"
                          : `${activeOption.label} contender`}{" "}
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
                );
              })}
            </div>
          )}

          {showMoreAvailable && (
            <div className="mt-6 flex justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsExpanded(true);
                  setPage(1);
                }}
                className="border-border bg-background/80 px-6 hover:bg-accent hover:text-accent-foreground dark:border-white/20 dark:bg-[#001845] dark:text-white dark:hover:bg-[#00205B] dark:hover:text-white"
              >
                Show More
              </Button>
            </div>
          )}

          {!isLoading && !errorMessage && isExpanded && totalPages > 1 && (
            <Pagination className="mt-6">
              <PaginationContent className="flex-wrap justify-center gap-2">
                <PaginationItem>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!leaderboard?.hasPreviousPage}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="border-border bg-background/80 hover:bg-accent hover:text-accent-foreground dark:border-white/20 dark:bg-[#001845] dark:text-white dark:hover:bg-[#00205B] dark:hover:text-white"
                  >
                    Previous
                  </Button>
                </PaginationItem>

                {paginationItems.map((item) => (
                  <PaginationItem key={item}>
                    {typeof item === "number" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={item === currentPage ? "default" : "outline"}
                        onClick={() => setPage(item)}
                        className={
                          item === currentPage
                            ? "min-w-9 bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-[#003566] dark:text-white dark:hover:bg-[#003566]"
                            : "min-w-9 border-border bg-background/80 hover:bg-accent hover:text-accent-foreground dark:border-white/20 dark:bg-[#001845] dark:text-white dark:hover:bg-[#00205B] dark:hover:text-white"
                        }
                      >
                        {item}
                      </Button>
                    ) : (
                      <PaginationEllipsis />
                    )}
                  </PaginationItem>
                ))}

                <PaginationItem>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!leaderboard?.hasNextPage}
                    onClick={() =>
                      setPage((current) =>
                        leaderboard?.hasNextPage ? current + 1 : current
                      )
                    }
                    className="border-border bg-background/80 hover:bg-accent hover:text-accent-foreground dark:border-white/20 dark:bg-[#001845] dark:text-white dark:hover:bg-[#00205B] dark:hover:text-white"
                  >
                    Next
                  </Button>
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
          </section>
        </div>
      </div>
    </main>
  );
}
