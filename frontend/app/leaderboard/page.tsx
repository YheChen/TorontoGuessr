"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, Play, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import { Spinner } from "@/components/site/spinner";
import { EmptyState, ErrorCard } from "@/components/site/states";
import { LeaderboardPodium } from "@/components/leaderboard-podium";
import { cn } from "@/lib/utils";
import { fetchLeaderboard } from "@/lib/api";
import type {
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
    label: "All time",
    description: "Top scores across every finished game.",
  },
  {
    value: "daily",
    label: "Daily",
    description: "Best scores from the last 24 hours.",
  },
  {
    value: "weekly",
    label: "Weekly",
    description: "Best scores from the last 7 days.",
  },
  {
    value: "monthly",
    label: "Monthly",
    description: "Best scores from the last 30 days.",
  },
];

const completedAtFormatter = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short",
});
const formatDate = (value: string) =>
  completedAtFormatter.format(new Date(value));

const PREVIEW_LIMIT = 5;
const EXPANDED_LIMIT = 25;

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

function getRankBadge(rank: number) {
  if (rank === 1) return "bg-medal-gold/15 text-medal-gold ring-medal-gold/35";
  if (rank === 2)
    return "bg-medal-silver/15 text-medal-silver ring-medal-silver/35";
  if (rank === 3)
    return "bg-medal-bronze/15 text-medal-bronze ring-medal-bronze/35";
  return "bg-muted text-muted-foreground ring-border";
}

export default function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(
    null,
  );
  const [period, setPeriod] = useState<LeaderboardPeriod>("lifetime");
  const [page, setPage] = useState(1);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const currentLimit = isExpanded ? EXPANDED_LIMIT : PREVIEW_LIMIT;

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
  };

  const activeOption = LEADERBOARD_OPTIONS.find(
    (option) => option.value === period,
  )!;
  const entries = leaderboard?.entries ?? [];
  const totalEntries = leaderboard?.total ?? 0;
  const totalPages = leaderboard?.totalPages ?? 1;
  const currentPage = leaderboard?.page ?? page;
  const currentPageSize = leaderboard?.limit ?? currentLimit;
  const rankOffset = (currentPage - 1) * currentPageSize;
  const showingFrom = totalEntries === 0 ? 0 : rankOffset + 1;
  const showingTo = totalEntries === 0 ? 0 : rankOffset + entries.length;
  const paginationItems = getPaginationItems(currentPage, totalPages);
  // By design, the all-time board expands to a top-25 view (no pagination),
  // while the time-bounded boards keep paging after the preview.
  const shouldPaginateExpanded = isExpanded && period !== "lifetime";
  const showMoreAvailable =
    !isLoading && !errorMessage && !isExpanded && totalEntries > PREVIEW_LIMIT;

  // Podium for the first page; the list then continues from rank 4.
  const showPodium =
    !isLoading && !errorMessage && currentPage === 1 && entries.length > 0;
  const listEntries = showPodium ? entries.slice(3) : entries;
  const listRankBase = showPodium ? 3 : 0;

  const summaryText = isLoading
    ? `Loading ${activeOption.label.toLowerCase()} scores…`
    : !isExpanded || period === "lifetime"
      ? `Top ${entries.length} of ${totalEntries} score${
          totalEntries === 1 ? "" : "s"
        }`
      : `Showing ${showingFrom}-${showingTo} of ${totalEntries} score${
          totalEntries === 1 ? "" : "s"
        }`;

  return (
    <section className="container py-10 sm:py-14">
      {/* Header */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            <Trophy className="size-3.5" />
            Leaderboard
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            Hall of the 6ix
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-muted-foreground">
            {activeOption.description}
          </p>
        </div>
        <Button asChild size="lg" className="rounded-xl shadow-glow">
          <Link href="/game">
            <Play className="size-4" />
            Play & compete
          </Link>
        </Button>
      </div>

      {/* Period segmented control + summary */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="inline-flex rounded-full border border-border/70 bg-muted/60 p-1 backdrop-blur">
            {LEADERBOARD_OPTIONS.map((option) => {
              const isActive = option.value === period;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handlePeriodChange(option.value)}
                  className={cn(
                    "whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-all sm:px-4",
                    isActive
                      ? "bg-card text-foreground shadow-soft"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-pressed={isActive}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-sm text-muted-foreground tabular">{summaryText}</p>
      </div>

      {/* Board */}
      <div className="mt-6">
        {isLoading && (
          <div className="surface-card flex items-center justify-center gap-3 rounded-2xl py-20 text-muted-foreground">
            <Spinner size={26} />
            <span className="text-sm font-medium">Loading scores…</span>
          </div>
        )}

        {!isLoading && errorMessage && (
          <ErrorCard
            title="Couldn't load the leaderboard"
            message={errorMessage}
          />
        )}

        {!isLoading && !errorMessage && entries.length === 0 && (
          <EmptyState
            icon={Trophy}
            title="No scores yet"
            description={`Be the first to set a ${activeOption.label.toLowerCase()} score. Finish a game and save your name.`}
            action={
              <Button asChild className="mt-1 rounded-xl">
                <Link href="/game">
                  <Play className="size-4" />
                  Play now
                </Link>
              </Button>
            }
          />
        )}

        {!isLoading && !errorMessage && entries.length > 0 && (
          <div className="space-y-6">
            {showPodium && <LeaderboardPodium entries={entries} />}

            {listEntries.length > 0 && (
              <ul className="space-y-2.5">
                {listEntries.map((entry, index) => {
                  const rank = rankOffset + listRankBase + index + 1;
                  return (
                    <li
                      key={entry.id}
                      className="group flex animate-fade-up items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card/50 px-4 py-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-accent/40 sm:px-5"
                      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <span
                          className={cn(
                            "grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold ring-1 ring-inset tabular",
                            getRankBadge(rank),
                          )}
                        >
                          {rank}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold" title={entry.username}>
                            {entry.username}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {formatDate(entry.completedAt)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold tabular">
                          {entry.totalScore.toLocaleString("en-US")}
                        </p>
                        <p className="text-xs text-muted-foreground">points</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {showMoreAvailable && (
              <div className="flex justify-center pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl px-8"
                  onClick={() => {
                    setIsExpanded(true);
                    setPage(1);
                  }}
                >
                  Show full leaderboard
                </Button>
              </div>
            )}

            {shouldPaginateExpanded && totalPages > 1 && (
              <Pagination className="pt-2">
                <PaginationContent className="flex-wrap justify-center gap-2">
                  <PaginationItem>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Previous page"
                      disabled={!leaderboard?.hasPreviousPage}
                      onClick={() =>
                        setPage((current) => Math.max(1, current - 1))
                      }
                      className="rounded-xl"
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                  </PaginationItem>

                  {paginationItems.map((item) => (
                    <PaginationItem key={item}>
                      {typeof item === "number" ? (
                        <Button
                          type="button"
                          size="icon"
                          variant={item === currentPage ? "default" : "outline"}
                          onClick={() => setPage(item)}
                          aria-current={item === currentPage ? "page" : undefined}
                          className="rounded-xl tabular"
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
                      size="icon"
                      aria-label="Next page"
                      disabled={!leaderboard?.hasNextPage}
                      onClick={() =>
                        setPage((current) =>
                          leaderboard?.hasNextPage ? current + 1 : current,
                        )
                      }
                      className="rounded-xl"
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
