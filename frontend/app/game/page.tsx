"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, RotateCcw, Save, Check, Flag } from "lucide-react";
import { GameHUD } from "@/components/game-hud";
import { GuessPanel } from "@/components/guess-panel";
import GamePanorama from "@/components/gamepanorama";
import { PanoPrefetch } from "@/components/pano-prefetch";
import { RoundCountdown } from "@/components/round-countdown";
import { GameResults } from "@/components/game-results";
import { LoadingScreen, ErrorCard } from "@/components/site/states";
import { CountUp } from "@/components/site/count-up";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  fetchNextRound,
  saveScoreUsername,
  startGame as startGameRequest,
  submitGuess as submitGuessRequest,
} from "@/lib/api";
import type {
  GuessLocation,
  GuessResponse,
  NextRoundResponse,
  StartGameResponse,
  SummaryResponse,
} from "@/lib/types";

type GameState =
  | "loading"
  | "guessing"
  | "submitting"
  | "results"
  | "summary"
  | "error";

const MAX_ROUND_SCORE = 5000;

function tierBarColor(score: number): string {
  if (score >= 4000) return "bg-success";
  if (score >= 2000) return "bg-primary";
  if (score > 0) return "bg-toronto-gold";
  return "bg-muted-foreground/40";
}

export default function Game() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(5);
  const [currentRoundData, setCurrentRoundData] = useState<
    StartGameResponse["round"] | null
  >(null);
  const [guessLocation, setGuessLocation] = useState<GuessLocation | null>(
    null,
  );
  const [gameState, setGameState] = useState<GameState>("loading");
  const [scores, setScores] = useState<GuessResponse[]>([]);
  const [currentResult, setCurrentResult] = useState<GuessResponse | null>(
    null,
  );
  const [timeLimit, setTimeLimit] = useState(60);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [savedUsername, setSavedUsername] = useState("Guest 0000");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [isSavingScore, setIsSavingScore] = useState(false);

  const totalScore = scores.reduce((sum, round) => sum + round.score, 0);

  const startGame = async () => {
    setGameState("loading");
    setErrorMessage(null);
    setUsernameInput("");
    setSavedUsername("Guest 0000");
    setSaveMessage(null);
    setSaveErrorMessage(null);
    setIsSavingScore(false);

    try {
      const game = await startGameRequest();
      setSessionId(game.sessionId);
      setSavedUsername(game.username);
      setCurrentRound(game.currentRound);
      setTotalRounds(game.totalRounds);
      setCurrentRoundData(game.round);
      setGuessLocation(null);
      setScores([]);
      setCurrentResult(null);
      setTimeLimit(game.timeLimit);
      setGameState("guessing");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start the game.";
      setErrorMessage(message);
      setGameState("error");
    }
  };

  useEffect(() => {
    void startGame();
  }, []);

  const handleMapClick = (lat: number, lng: number) => {
    if (gameState === "guessing") {
      setGuessLocation({ lat, lng });
    }
  };

  const handleUsernameChange = (value: string) => {
    setUsernameInput(value.replace(/[^A-Za-z0-9]/g, "").slice(0, 10));
    setSaveErrorMessage(null);
    setSaveMessage(null);
  };

  const handleSaveScore = async () => {
    if (!sessionId || gameState !== "summary") {
      return;
    }

    setIsSavingScore(true);
    setSaveErrorMessage(null);
    setSaveMessage(null);

    try {
      const response = await saveScoreUsername(sessionId, usernameInput);
      setSavedUsername(response.saved.username);
      setSaveMessage(`Saved as ${response.saved.username}.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save score name.";
      setSaveErrorMessage(message);
    } finally {
      setIsSavingScore(false);
    }
  };

  const handleSubmitGuess = async () => {
    if (!sessionId || !currentRoundData || gameState !== "guessing") {
      return;
    }

    setGameState("submitting");
    setErrorMessage(null);

    try {
      const result = await submitGuessRequest(sessionId, guessLocation);
      setCurrentResult(result);
      setScores((existing) => [...existing, result]);
      setGameState("results");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to submit guess.";
      setErrorMessage(message);
      setGameState("error");
    }
  };

  const handleNextRound = async () => {
    if (!sessionId || !currentResult) {
      return;
    }

    if (currentResult.isLastRound) {
      setGameState("summary");
      return;
    }

    // Fast path: the guess response already carried the next round, so the
    // transition needs no API call (and the panorama was prefetched).
    const prefetched = currentResult.nextRound;
    if (prefetched) {
      setCurrentRound(prefetched.currentRound);
      setTotalRounds(prefetched.totalRounds);
      setCurrentRoundData(prefetched.round);
      setGuessLocation(null);
      setCurrentResult(null);
      setTimeLimit(prefetched.timeLimit);
      setGameState("guessing");
      return;
    }

    setGameState("loading");
    setErrorMessage(null);

    try {
      const response = await fetchNextRound(sessionId);
      if ("gameFinished" in response && response.gameFinished) {
        const summaryResponse = response as SummaryResponse;
        setScores(summaryResponse.summary.rounds);
        setGameState("summary");
        return;
      }

      const nextRound = response as NextRoundResponse;
      setCurrentRound(nextRound.currentRound);
      setTotalRounds(nextRound.totalRounds);
      setCurrentRoundData(nextRound.round);
      setGuessLocation(null);
      setCurrentResult(null);
      setTimeLimit(nextRound.timeLimit);
      setGameState("guessing");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load the next round.";
      setErrorMessage(message);
      setGameState("error");
    }
  };

  const isPlaying = gameState === "guessing" || gameState === "submitting";
  const maxTotal = totalRounds * MAX_ROUND_SCORE;
  const bestRound = scores.reduce((best, r) => Math.max(best, r.score), 0);

  return (
    <>
      {/* ───────── Playing: immersive panorama + floating guess panel ───────── */}
      {isPlaying && currentRoundData && (
        <section className="mx-auto w-full max-w-[1500px] px-3 py-4 sm:px-4 lg:px-6">
          <div className="relative lg:h-[calc(100dvh-8rem)] lg:min-h-[560px]">
            {/* Panorama: stacked on mobile, fills the stage on desktop */}
            <div className="relative h-[46vh] min-h-[300px] w-full lg:absolute lg:inset-0 lg:h-full">
              <GamePanorama
                panoId={currentRoundData.panoId}
                heading={currentRoundData.heading}
                pitch={currentRoundData.pitch}
                zoom={currentRoundData.zoom}
              />
            </div>

            {/* HUD */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 sm:p-4">
              <GameHUD
                currentRound={currentRound}
                totalRounds={totalRounds}
                scores={scores}
                timerSlot={
                  <RoundCountdown
                    timeLimit={timeLimit}
                    roundKey={currentRound}
                    paused={gameState !== "guessing"}
                    onExpire={() => void handleSubmitGuess()}
                  />
                }
              />
            </div>

            {/* Guess panel */}
            <div className="relative z-20 mt-3 lg:absolute lg:bottom-4 lg:right-4 lg:mt-0 lg:w-[360px] xl:w-[400px]">
              <GuessPanel
                guessLocation={guessLocation}
                onMapClick={handleMapClick}
                onSubmitGuess={() => void handleSubmitGuess()}
                isSubmitting={gameState === "submitting"}
                className="h-[48vh] min-h-[340px] lg:h-[clamp(360px,46vh,520px)]"
              />
            </div>
          </div>
        </section>
      )}

      {/* ───────── Non-immersive states share a centered container ───────── */}
      {!isPlaying && (
        <section className="container py-8 sm:py-10">
          {gameState === "loading" && (
            <div className="mx-auto max-w-xl">
              <LoadingScreen
                title="Loading round…"
                description="Preparing Toronto Street View and map data."
              />
            </div>
          )}

          {gameState === "error" && (
            <div className="mx-auto max-w-xl">
              <ErrorCard
                message={errorMessage ?? "The game could not continue."}
                onRetry={() => void startGame()}
                retryLabel="Try again"
              />
            </div>
          )}

          {gameState === "results" && currentResult?.nextRound && (
            <PanoPrefetch panoId={currentResult.nextRound.round.panoId} />
          )}

          {gameState === "results" && currentResult && (
            <div className="mx-auto max-w-6xl">
              <GameResults
                guessLocation={currentResult.guessLocation}
                actualLocation={currentResult.actualLocation}
                score={currentResult.score}
                distance={currentResult.distance}
                onNextRound={() => void handleNextRound()}
                isLastRound={currentResult.isLastRound}
                roundNumber={currentResult.roundNumber}
                totalRounds={totalRounds}
              />
            </div>
          )}

          {gameState === "summary" && (
            <div className="mx-auto max-w-3xl">
              {/* Hero */}
              <div className="surface-card relative animate-fade-up overflow-hidden rounded-3xl px-6 py-10 text-center sm:px-10">
                <div
                  className="absolute inset-0 -z-10 bg-grid-fade"
                  aria-hidden="true"
                />
                <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                  <Flag className="size-3.5" />
                  Game complete
                </span>
                <p className="mt-6 text-sm text-muted-foreground">
                  Final score
                </p>
                <p className="mt-1 flex items-baseline justify-center gap-2">
                  <span className="text-6xl font-bold tracking-tight tabular sm:text-7xl">
                    <CountUp value={totalScore} />
                  </span>
                  <span className="text-xl font-medium text-muted-foreground">
                    / {maxTotal.toLocaleString("en-US")}
                  </span>
                </p>
                <p className="mt-4 text-sm text-muted-foreground">
                  Best round{" "}
                  <span className="font-semibold text-foreground tabular">
                    {bestRound.toLocaleString("en-US")}
                  </span>{" "}
                  · Leaderboard name{" "}
                  <span className="font-semibold text-foreground">
                    {savedUsername}
                  </span>
                </p>
              </div>

              {/* Round breakdown */}
              <div className="surface-card mt-5 animate-fade-up rounded-2xl p-6 delay-75 sm:p-7">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Round breakdown
                </h3>
                <ul className="mt-4 space-y-3">
                  {scores.map((round) => {
                    const pct = Math.max(
                      0,
                      Math.min(100, (round.score / MAX_ROUND_SCORE) * 100),
                    );
                    return (
                      <li
                        key={round.roundNumber}
                        className="flex items-center gap-4"
                      >
                        <span className="w-16 shrink-0 text-sm font-medium text-muted-foreground">
                          Round {round.roundNumber}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full transition-[width] duration-700 ease-spring",
                              tierBarColor(round.score),
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-28 shrink-0 text-right text-sm">
                          <span className="font-bold tabular">
                            {round.score.toLocaleString("en-US")}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {round.distance === null
                              ? "No guess"
                              : round.distance < 1
                                ? `${Math.round(round.distance * 1000)} m`
                                : `${round.distance.toFixed(2)} km`}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Save username */}
              <div className="surface-card mt-5 animate-fade-up rounded-2xl p-6 delay-150 sm:p-7">
                <div className="flex items-center gap-2">
                  <Save className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold">
                    Save your name to the leaderboard
                  </h3>
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={usernameInput}
                    onChange={(event) =>
                      handleUsernameChange(event.target.value)
                    }
                    placeholder={savedUsername}
                    maxLength={10}
                    aria-label="Leaderboard name"
                    className="sm:flex-1"
                  />
                  <Button
                    type="button"
                    onClick={() => void handleSaveScore()}
                    disabled={isSavingScore}
                    className="sm:min-w-[140px]"
                  >
                    {isSavingScore ? "Saving…" : "Save name"}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Letters and numbers only, up to 10 characters.
                </p>
                {saveMessage && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-success">
                    <Check className="size-4" />
                    {saveMessage}
                  </p>
                )}
                {saveErrorMessage && (
                  <p className="mt-2 text-sm font-medium text-destructive">
                    {saveErrorMessage}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button
                  onClick={() => void startGame()}
                  size="xl"
                  className="rounded-2xl shadow-glow"
                >
                  <RotateCcw className="size-5" />
                  Play again
                </Button>
                <Button
                  asChild
                  size="xl"
                  variant="outline"
                  className="rounded-2xl"
                >
                  <Link href="/leaderboard">
                    <Trophy className="size-5" />
                    View leaderboard
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
