"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Flame,
  Gamepad2,
  Info,
  Trophy,
  UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/site/stat-card";
import { EmptyState, ErrorCard, LoadingScreen } from "@/components/site/states";
import { fetchGameHistory, fetchProfile, importStreakBest } from "@/lib/api";
import { getSession, isAuthConfigured } from "@/lib/auth-client";
import { formatDay } from "@/lib/date-toronto";
import { readStreak } from "@/lib/streak";
import { cn } from "@/lib/utils";
import type { GameHistoryEntry, Profile } from "@/lib/types";

const PAGE_SIZE = 20;

const MODE_LABELS: Record<string, string> = {
  classic: "Classic",
  daily: "Daily",
  challenge: "Challenge",
};

function modeLabel(mode: string): string {
  return MODE_LABELS[mode] ?? "Classic";
}

/** "Jul 31" for a completion timestamp, in Toronto's calendar. */
function completedLabel(completedAt: string | null): string {
  if (!completedAt) {
    return "Unknown date";
  }
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(completedAt));
  return formatDay(key);
}

export function AccountClient() {
  const [checked, setChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [entries, setEntries] = useState<GameHistoryEntry[]>([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const session = await getSession();
    setSignedIn(session !== null);
    setChecked(true);
    if (!session) {
      setIsLoading(false);
      return;
    }

    try {
      // A streak earned before this account existed lives only in this browser,
      // and the server cannot derive it: the games that built it were never
      // attributed. Offer it once per visit, before reading the profile, so the
      // number shown already includes it. importStreakBest only ever raises the
      // stored best, so repeating this is harmless.
      const local = readStreak();
      if (local.best > 0) {
        try {
          await importStreakBest(local.best);
        } catch {
          // A refused import must not cost anyone their history page.
        }
      }

      const [{ profile: loaded }, history] = await Promise.all([
        fetchProfile(),
        fetchGameHistory({ page, limit: PAGE_SIZE }),
      ]);
      setProfile(loaded);
      setEntries(history.entries);
      setHasNextPage(history.hasNextPage);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not load your account."
      );
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  if (!isAuthConfigured) {
    return (
      <section className="container py-10 sm:py-14">
        <EmptyState
          icon={UserIcon}
          title="Accounts are not enabled"
          description="This deployment is not wired for accounts, so there is nothing to show here."
          action={
            <Button asChild className="rounded-xl">
              <Link href="/game">Play a game</Link>
            </Button>
          }
        />
      </section>
    );
  }

  if (checked && !signedIn) {
    return (
      <section className="container py-10 sm:py-14">
        <EmptyState
          icon={UserIcon}
          title="You are not signed in"
          description="Finish a game and save your progress, or use Sign in on the navbar if you already have an account."
          action={
            <Button asChild className="rounded-xl">
              <Link href="/game">Play a game</Link>
            </Button>
          }
        />
      </section>
    );
  }

  const bestGame = entries.reduce<GameHistoryEntry | null>(
    (best, entry) => (entry.totalScore > (best?.totalScore ?? -1) ? entry : best),
    null
  );

  return (
    <section className="container py-10 sm:py-14">
      <div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <UserIcon className="size-3.5" />
          Account
        </span>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          {profile?.displayName ?? "Your account"}
        </h1>
        <p className="mt-3 max-w-xl text-pretty text-muted-foreground">
          Your streak and the games filed under this account. Days are counted on
          Toronto&rsquo;s calendar, the same boundary the stats page uses.
        </p>
      </div>

      <div className="mt-8">
        {isLoading && (
          <LoadingScreen
            title="Loading your account…"
            description="Fetching your streak and recent games."
          />
        )}

        {!isLoading && errorMessage && (
          <ErrorCard
            title="Could not load your account"
            message={errorMessage}
            onRetry={() => setReloadKey((key) => key + 1)}
          />
        )}

        {!isLoading && !errorMessage && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                icon={Flame}
                label="Current streak"
                value={profile?.currentStreak ?? 0}
                suffix={profile?.currentStreak === 1 ? " day" : " days"}
              />
              <StatCard
                icon={Trophy}
                label="Best streak"
                value={profile?.bestStreak ?? 0}
                suffix={profile?.bestStreak === 1 ? " day" : " days"}
              />
              <StatCard
                icon={Gamepad2}
                label="Best game here"
                value={bestGame?.totalScore ?? 0}
              />
            </div>

            {/* Says it plainly rather than looking like it lost a game. Signing
                in is offered on the summary screen, so the account does not
                exist while the game that led to it is being filed. */}
            <p className="mt-4 inline-flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              Games played before you made this account are not listed, including
              the one you signed up on. Your streak still counts them if it was
              saved in this browser.
            </p>

            <h2 className="mt-10 text-lg font-semibold">Finished games</h2>

            {entries.length === 0 ? (
              <EmptyState
                className="mt-4"
                icon={CalendarDays}
                title="No games filed yet"
                description="Finish a game while signed in and it will appear here."
                action={
                  <Button asChild className="rounded-xl">
                    <Link href="/game">Play a game</Link>
                  </Button>
                }
              />
            ) : (
              <>
                <div className="surface-card mt-4 overflow-x-auto rounded-2xl">
                  <table className="w-full min-w-[28rem] text-sm">
                    <thead>
                      <tr className="border-b border-border/70 text-left text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        <th className="px-5 py-3">Date</th>
                        <th className="px-5 py-3">Mode</th>
                        <th className="px-5 py-3 text-right">Rounds</th>
                        <th className="px-5 py-3 text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => (
                        <tr
                          key={entry.sessionId}
                          className="border-b border-border/40 last:border-0"
                        >
                          <td className="px-5 py-3 font-medium">
                            {completedLabel(entry.completedAt)}
                          </td>
                          <td className="px-5 py-3 text-muted-foreground">
                            {modeLabel(entry.mode)}
                          </td>
                          <td className="px-5 py-3 text-right text-muted-foreground">
                            {entry.roundsPlayed}
                          </td>
                          <td
                            className={cn(
                              "px-5 py-3 text-right font-semibold tabular-nums",
                              entry.sessionId === bestGame?.sessionId &&
                                "text-success"
                            )}
                          >
                            {entry.totalScore.toLocaleString("en-US")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {(page > 1 || hasNextPage) && (
                  <div className="mt-4 flex items-center justify-between">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl"
                      disabled={page === 1}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                    >
                      Newer
                    </Button>
                    <span className="text-xs text-muted-foreground">Page {page}</span>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl"
                      disabled={!hasNextPage}
                      onClick={() => setPage((current) => current + 1)}
                    >
                      Older
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
