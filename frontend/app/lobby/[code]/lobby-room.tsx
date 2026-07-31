"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  Crosshair,
  Flag,
  MapPin,
  Play,
  RotateCcw,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GameMap, type GuessPin } from "@/components/game-map";
import GamePanorama from "@/components/gamepanorama";
import { LobbyScoreboard } from "@/components/lobby-scoreboard";
import { LoadingScreen, ErrorCard } from "@/components/site/states";
import { CountUp } from "@/components/site/count-up";
import { cn } from "@/lib/utils";
import {
  advanceLobby,
  fetchLobbyState,
  joinLobby,
  rematchLobby,
  startLobby,
  submitLobbyGuess,
} from "@/lib/api";
import {
  guessProgress,
  playerColor,
  readLobbyToken,
  secondsUntil,
  writeLobbyToken,
} from "@/lib/lobby-client";
import { subscribeToLobby } from "@/lib/lobby-realtime";
import type { GuessLocation, LobbyState } from "@/lib/types";

/** Polling cadence when the push socket is not carrying changes. */
const POLL_INTERVAL_MS = 2000;
/** Slower safety net once push is live: it only has to catch missed messages. */
const POLL_INTERVAL_PUSHED_MS = 10000;
/** A change can arrive as a burst (a guess that also reveals); coalesce them. */
const REFETCH_DEBOUNCE_MS = 120;
/**
 * How often a finished lobby checks whether the host started another game.
 *
 * Far slower than gameplay polling because the only thing being waited for is one
 * button press, and a few seconds late costs nothing.
 */
const REMATCH_POLL_MS = 3000;
/**
 * How long to keep watching. A tab left open on a final scoreboard should not
 * poll for the rest of the day, so the watch gives up and says so rather than
 * running until the lobby expires and starts answering 404.
 */
const REMATCH_WATCH_MS = 10 * 60 * 1000;
const MAX_ROUND_SCORE = 5000;

function sanitizeName(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
}

export function LobbyRoom({ joinCode }: { joinCode: string }) {
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  // Guards the first fetch: reading the saved token is a client-only effect, so
  // polling before it lands would flash the join screen at a seated player.
  const [tokenChecked, setTokenChecked] = useState(false);
  const [state, setState] = useState<LobbyState | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [guessLocation, setGuessLocation] = useState<GuessLocation | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);
  // True while the push socket is live; polling backs off to a safety net.
  const [pushConnected, setPushConnected] = useState(false);
  // Tracks which round the local pin belongs to, so it clears on a new round.
  const pinRoundRef = useRef<number | null>(null);
  const [isRematching, setIsRematching] = useState(false);
  // True once the finished lobby has stopped watching for a rematch.
  const [rematchWatchEnded, setRematchWatchEnded] = useState(false);

  useEffect(() => {
    setPlayerToken(readLobbyToken(joinCode));
    setTokenChecked(true);
  }, [joinCode]);

  const load = useCallback(
    async (token: string | null) => {
      try {
        const next = await fetchLobbyState(joinCode, token);
        setState(next);
        setFetchedAt(Date.now());
        setErrorMessage(null);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load the lobby.",
        );
      }
    },
    [joinCode],
  );

  // Poll for shared state. The backend settles the lobby on every read, so
  // polling is also what drives round progression forward. A finished lobby is
  // terminal: stop polling so viewers do not hammer the API forever, and so the
  // final score animation is not restarted by a re-render every two seconds.
  // While push is connected this drops to a slow safety net.
  const lobbyFinished = state?.status === "finished";
  useEffect(() => {
    if (!tokenChecked || lobbyFinished) return;
    let cancelled = false;
    void load(playerToken);
    const timer = window.setInterval(
      () => {
        if (!cancelled) void load(playerToken);
      },
      pushConnected ? POLL_INTERVAL_PUSHED_MS : POLL_INTERVAL_MS,
    );
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [load, playerToken, tokenChecked, lobbyFinished, pushConnected]);

  // Push: refetch as soon as the backend says something moved, instead of
  // waiting out the poll. Debounced because one action can emit a burst.
  useEffect(() => {
    if (!tokenChecked || lobbyFinished) return;

    let debounce: number | undefined;
    const subscription = subscribeToLobby(
      joinCode,
      () => {
        window.clearTimeout(debounce);
        debounce = window.setTimeout(
          () => void load(playerToken),
          REFETCH_DEBOUNCE_MS,
        );
      },
      setPushConnected,
    );

    return () => {
      window.clearTimeout(debounce);
      subscription?.unsubscribe();
      setPushConnected(false);
    };
  }, [joinCode, load, playerToken, tokenChecked, lobbyFinished]);

  /**
   * While the lobby is finished, watch for the host starting another game.
   *
   * A separate effect from the gameplay poll above, and not simply a matter of
   * letting that one keep running, for two reasons the original comment on it
   * names: a finished lobby should not hammer the API, and re-rendering the final
   * screen every couple of seconds restarts the winner's score animation.
   *
   * Both are handled by committing state ONLY once the lobby is no longer
   * finished. Nothing else on that screen can change, so a poll that comes back
   * still-finished is dropped and the screen never re-renders. That is also why
   * this does not reuse `load`, which commits unconditionally.
   */
  useEffect(() => {
    if (!tokenChecked || !lobbyFinished) return;

    let cancelled = false;
    let waited = 0;

    const timer = window.setInterval(() => {
      waited += REMATCH_POLL_MS;
      if (waited >= REMATCH_WATCH_MS) {
        window.clearInterval(timer);
        if (!cancelled) setRematchWatchEnded(true);
        return;
      }

      void (async () => {
        try {
          const next = await fetchLobbyState(joinCode, playerToken);
          // Still finished means the host has not pressed anything yet. Dropping
          // it keeps the final scoreboard perfectly still.
          if (!cancelled && next.status !== "finished") {
            setState(next);
            setFetchedAt(Date.now());
          }
        } catch {
          // Transient; the next tick tries again. A failure here must not replace
          // the final scoreboard with an error.
        }
      })();
    }, REMATCH_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tokenChecked, lobbyFinished, joinCode, playerToken]);

  // Local 1s tick so the countdown moves between polls.
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // A new round clears the previous pin.
  useEffect(() => {
    if (!state) return;
    if (pinRoundRef.current !== state.currentRound) {
      pinRoundRef.current = state.currentRound;
      setGuessLocation(null);
    }
  }, [state]);

  const handleJoin = async () => {
    setIsJoining(true);
    setErrorMessage(null);
    try {
      const joined = await joinLobby(joinCode, displayName);
      writeLobbyToken(joinCode, joined.playerToken);
      setPlayerToken(joined.playerToken);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not join that lobby.",
      );
    } finally {
      setIsJoining(false);
    }
  };

  const runAction = async (
    action: () => Promise<LobbyState>,
    failureMessage: string,
  ) => {
    setActionMessage(null);
    try {
      const next = await action();
      setState(next);
      setFetchedAt(Date.now());
    } catch (error) {
      setActionMessage(
        error instanceof Error ? error.message : failureMessage,
      );
    }
  };

  const handleStart = () =>
    playerToken &&
    runAction(
      () => startLobby(joinCode, playerToken),
      "Could not start the game.",
    );

  const handleRematch = async () => {
    if (!playerToken) return;
    setIsRematching(true);
    // Cleared so a stale "watch ended" note cannot sit under a game that is now
    // running, in case the host presses this after the watch window lapsed.
    setRematchWatchEnded(false);
    await runAction(
      () => rematchLobby(joinCode, playerToken),
      "Could not start another game.",
    );
    setIsRematching(false);
  };

  const handleAdvance = () =>
    playerToken &&
    runAction(
      () => advanceLobby(joinCode, playerToken),
      "Could not advance the round.",
    );

  const handleSubmit = async () => {
    if (!playerToken) return;
    setIsSubmitting(true);
    await runAction(
      () => submitLobbyGuess(joinCode, playerToken, guessLocation),
      "Could not submit your guess.",
    );
    setIsSubmitting(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/lobby/${joinCode}`,
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked; the code is on screen to read out instead.
    }
  };

  // Stable colour per player, assigned by join order (the backend's ordering).
  const colorIndex = useMemo(() => {
    const map = new Map<string, number>();
    (state?.players ?? []).forEach((player, index) =>
      map.set(player.playerId, index),
    );
    return map;
  }, [state?.players]);

  const revealPins = useMemo<GuessPin[]>(() => {
    if (!state?.roundRevealed) return [];
    return state.players
      .filter((player) => player.guessLocation)
      .map((player) => ({
        id: player.playerId,
        label: player.displayName,
        location: player.guessLocation as GuessLocation,
        color: playerColor(colorIndex.get(player.playerId) ?? 0),
        distanceKm: player.roundDistance ?? null,
      }));
  }, [state, colorIndex]);

  if (!state && !errorMessage) {
    return (
      <section className="container py-10">
        <div className="mx-auto max-w-xl">
          <LoadingScreen
            title="Loading lobby…"
            description={`Looking up lobby ${joinCode}.`}
          />
        </div>
      </section>
    );
  }

  if (!state) {
    return (
      <section className="container py-10">
        <div className="mx-auto max-w-xl">
          <ErrorCard
            title="Lobby unavailable"
            message={errorMessage ?? "That lobby could not be loaded."}
          />
          <div className="mt-4 flex justify-center">
            <Button asChild variant="outline" className="rounded-xl">
              <Link href="/lobby">Back to multiplayer</Link>
            </Button>
          </div>
        </div>
      </section>
    );
  }

  // Not in this lobby yet: offer to take a seat.
  if (!state.you) {
    const full = state.players.length >= 8;
    const started = state.status !== "waiting";
    return (
      <section className="container py-10 sm:py-14">
        <div className="mx-auto max-w-md">
          <div className="surface-card rounded-2xl p-6 text-center sm:p-7">
            <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              <Users className="size-3.5" />
              Lobby {joinCode}
            </span>
            <h1 className="mt-5 text-2xl font-bold tracking-tight">
              {started
                ? "This game has already started"
                : full
                  ? "This lobby is full"
                  : "Join this lobby"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {started || full
                ? "Ask for a new lobby code, or start your own game."
                : `${state.players.length} player${state.players.length === 1 ? "" : "s"} waiting.`}
            </p>

            {!started && !full && (
              <div className="mt-6 text-left">
                <label
                  htmlFor="join-name"
                  className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  Your name
                </label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="join-name"
                    value={displayName}
                    onChange={(event) =>
                      setDisplayName(sanitizeName(event.target.value))
                    }
                    placeholder="Guest"
                    maxLength={10}
                    className="sm:flex-1"
                  />
                  <Button
                    type="button"
                    onClick={() => void handleJoin()}
                    disabled={isJoining}
                    className="rounded-xl"
                  >
                    {isJoining ? "Joining…" : "Join"}
                  </Button>
                </div>
              </div>
            )}

            {errorMessage && (
              <p className="mt-4 text-sm font-medium text-destructive">
                {errorMessage}
              </p>
            )}

            <Button asChild variant="outline" className="mt-6 rounded-xl">
              <Link href="/lobby">Back to multiplayer</Link>
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const elapsed = Date.now() - fetchedAt;
  const secondsLeft = state.roundRevealed
    ? secondsUntil(state.revealDeadlineAt, state.serverTime, elapsed)
    : secondsUntil(state.roundDeadlineAt, state.serverTime, elapsed);
  const progress = guessProgress(state.players);
  const isHost = state.you.isHost;
  // One source of truth for "there is nothing after this round", used by both the
  // host's button and the countdown everyone else sees. They disagreed before:
  // the button said "See final scores" while the countdown promised a next round.
  const isLastRound = state.currentRound >= state.totalRounds;
  const maxTotal = state.totalRounds * MAX_ROUND_SCORE;
  const winner = [...state.players].sort(
    (a, b) => b.totalScore - a.totalScore,
  )[0];
  // Referenced so the 1s tick re-renders the countdown.
  void tick;

  // ---- waiting room ----
  if (state.status === "waiting") {
    return (
      <section className="container py-10 sm:py-14">
        <div className="mx-auto max-w-2xl">
          <div className="surface-card rounded-2xl p-6 text-center sm:p-8">
            <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              <Users className="size-3.5" />
              Waiting room
            </span>
            <p className="mt-6 text-sm text-muted-foreground">Lobby code</p>
            <p className="font-mono-accent mt-1 text-5xl font-bold tracking-[0.2em]">
              {joinCode}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCopy()}
              className="mt-4 rounded-xl"
            >
              {copied ? (
                <>
                  <Check className="size-4 text-success" />
                  Link copied!
                </>
              ) : (
                <>
                  <Copy className="size-4" />
                  Copy invite link
                </>
              )}
            </Button>
          </div>

          <div className="surface-card mt-5 rounded-2xl p-6 sm:p-7">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Players ({state.players.length} / 8)
            </h2>
            <div className="mt-4">
              <LobbyScoreboard
                players={state.players}
                hostPlayerId={state.hostPlayerId}
                youPlayerId={state.you.playerId}
                colorIndex={colorIndex}
                showRoundDetail={false}
                showGuessStatus={false}
              />
            </div>
          </div>

          {isHost ? (
            <Button
              type="button"
              onClick={() => void handleStart()}
              size="xl"
              className="mt-6 w-full rounded-2xl shadow-glow"
            >
              <Play className="size-5" />
              Start game
            </Button>
          ) : (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Waiting for the host to start…
            </p>
          )}

          {actionMessage && (
            <p className="mt-3 text-center text-sm font-medium text-destructive">
              {actionMessage}
            </p>
          )}
        </div>
      </section>
    );
  }

  // ---- final scoreboard ----
  if (state.status === "finished") {
    return (
      <section className="container py-10 sm:py-14">
        <div className="mx-auto max-w-2xl">
          <div className="surface-card relative overflow-hidden rounded-3xl px-6 py-10 text-center sm:px-10">
            <div
              className="absolute inset-0 -z-10 bg-grid-fade"
              aria-hidden="true"
            />
            <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              <Flag className="size-3.5" />
              Lobby complete
            </span>
            {winner && (
              <>
                <p className="mt-6 text-sm text-muted-foreground">Winner</p>
                <p className="mt-1 text-4xl font-bold tracking-tight sm:text-5xl">
                  {winner.displayName}
                </p>
                <p className="mt-3 flex items-baseline justify-center gap-2">
                  <span className="text-3xl font-bold tabular">
                    <CountUp value={winner.totalScore} />
                  </span>
                  <span className="text-base text-muted-foreground">
                    / {maxTotal.toLocaleString("en-US")}
                  </span>
                </p>
              </>
            )}
          </div>

          <div className="surface-card mt-5 rounded-2xl p-6 sm:p-7">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Final scores
            </h2>
            <div className="mt-4">
              <LobbyScoreboard
                players={state.players}
                hostPlayerId={state.hostPlayerId}
                youPlayerId={state.you.playerId}
                colorIndex={colorIndex}
                showRoundDetail={false}
                showGuessStatus={false}
              />
            </div>
          </div>

          {/* Another game with the same people, same code, nobody re-joining.
              Only the host can press it, because only the host can deal rounds,
              so everyone else gets told what they are waiting for rather than
              being shown a button that would refuse them. */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {isHost ? (
              <Button
                type="button"
                size="xl"
                className="rounded-2xl shadow-glow"
                onClick={() => void handleRematch()}
                disabled={isRematching}
              >
                <RotateCcw className="size-5" />
                {isRematching ? "Starting…" : "Play again"}
              </Button>
            ) : (
              <Button asChild size="xl" className="rounded-2xl shadow-glow">
                <Link href="/lobby">
                  <Users className="size-5" />
                  New lobby
                </Link>
              </Button>
            )}
            <Button asChild size="xl" variant="outline" className="rounded-2xl">
              <Link href="/leaderboard">
                <Trophy className="size-5" />
                View leaderboard
              </Link>
            </Button>
          </div>

          {isHost ? (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Play again keeps everyone here, on code {state.joinCode}. Scores
              reset and five new locations are dealt.
            </p>
          ) : rematchWatchEnded ? (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Stopped watching for a new game. Reload this page if the host starts
              one.
            </p>
          ) : (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Stay here if you want another round: if the host starts one, this
              page joins it automatically.
            </p>
          )}

          {actionMessage && (
            <p className="mt-3 text-center text-sm font-medium text-destructive">
              {actionMessage}
            </p>
          )}
        </div>
      </section>
    );
  }

  // ---- in progress: guessing or reveal ----
  const revealed = state.roundRevealed;

  return (
    // `relative` anchors the floating guess panel below; without it the panel
    // escapes to the page and drags the layout out of the viewport.
    <section className="relative mx-auto w-full max-w-[1500px] px-3 py-4 sm:px-4 lg:px-6">
      <div className="lg:grid lg:h-[calc(100dvh-8.5rem)] lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-5">
        {/* Left column: status + scoreboard */}
        <div className="order-2 mt-3 lg:order-1 lg:mt-0 lg:overflow-y-auto">
          <div className="surface-card rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Round {state.currentRound} of {state.totalRounds}
              </span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-bold tabular",
                  secondsLeft <= 10
                    ? "bg-toronto-red/15 text-toronto-red"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {secondsLeft}s
              </span>
            </div>

            <p className="mt-3 text-sm font-medium">
              {revealed
                ? "Round results"
                : `${progress.guessed} / ${progress.total} locked in`}
            </p>

            <div className="mt-4">
              <LobbyScoreboard
                players={state.players}
                hostPlayerId={state.hostPlayerId}
                youPlayerId={state.you.playerId}
                colorIndex={colorIndex}
                showRoundDetail={revealed}
                showGuessStatus={!revealed}
              />
            </div>

            {revealed && (
              <>
                {isHost ? (
                  <Button
                    type="button"
                    onClick={() => void handleAdvance()}
                    size="lg"
                    className="mt-5 w-full rounded-xl shadow-glow"
                  >
                    {isLastRound ? "See final scores" : "Next round"}
                  </Button>
                ) : (
                  <p className="mt-5 text-center text-xs text-muted-foreground">
                    {/* Matches the host's button, which already says "See final
                        scores" here. After the last round the timer is not
                        counting toward another round, it is counting toward the
                        final scoreboard, and saying otherwise promises a sixth
                        round that never comes. */}
                    {isLastRound ? "Show results in" : "Next round in"}{" "}
                    {secondsLeft}s
                  </p>
                )}
              </>
            )}

            {!revealed && (
              <Button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={
                  !guessLocation || isSubmitting || state.you.hasGuessed
                }
                size="lg"
                className="mt-5 w-full rounded-xl shadow-glow"
              >
                <Crosshair className="size-4" />
                {state.you.hasGuessed
                  ? "Guess locked in"
                  : isSubmitting
                    ? "Submitting…"
                    : guessLocation
                      ? "Submit guess"
                      : "Place a pin to guess"}
              </Button>
            )}

            {actionMessage && (
              <p className="mt-3 text-sm font-medium text-destructive">
                {actionMessage}
              </p>
            )}
          </div>
        </div>

        {/* Right column: panorama while guessing, everyone's pins on reveal */}
        <div className="order-1 lg:order-2 lg:h-full">
          <div
            className={cn(
              "relative h-[46vh] min-h-[320px] w-full overflow-hidden rounded-2xl lg:h-full",
              revealed && "hidden",
            )}
          >
            {!revealed && state.round && (
              <GamePanorama
                panoId={state.round.panoId}
                heading={state.round.heading}
                pitch={state.round.pitch}
                zoom={state.round.zoom}
              />
            )}
          </div>

          <div
            className={cn(
              "h-[46vh] min-h-[320px] w-full lg:h-full",
              !revealed && "hidden",
            )}
          >
            {revealed && (
              <GameMap
                guessLocation={null}
                actualLocation={state.actualLocation}
                isGuessing={false}
                guessPins={revealPins}
                viewResetKey={`reveal-${state.currentRound}`}
              />
            )}
          </div>
        </div>
      </div>

      {/* Guess map: floats over the panorama on desktop while guessing */}
      {!revealed && (
        <div className="mt-3 lg:absolute lg:bottom-6 lg:right-6 lg:z-20 lg:mt-0 lg:w-[340px] xl:w-[380px]">
          <div className="glass-strong overflow-hidden rounded-2xl shadow-elevated">
            <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                <MapPin className="size-3.5 text-toronto-red" />
                Your guess
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  guessLocation ? "text-success" : "text-muted-foreground",
                )}
              >
                {state.you.hasGuessed
                  ? "Locked in"
                  : guessLocation
                    ? "Pin placed"
                    : "Tap the map"}
              </span>
            </div>
            <div className="h-[240px] p-2.5">
              <GameMap
                onMapClick={(lat, lng) => {
                  if (!state.you?.hasGuessed) setGuessLocation({ lat, lng });
                }}
                guessLocation={guessLocation}
                actualLocation={null}
                isGuessing
                viewResetKey={`guess-${state.currentRound}`}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
