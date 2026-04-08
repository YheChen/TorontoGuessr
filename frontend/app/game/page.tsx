"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Header from "@/components/Header";
import { GameControls } from "@/components/game-controls";
import { GameMap } from "@/components/game-map";
import { GameProgress } from "@/components/game-progress";
import GamePanorama from "@/components/gamepanorama";
import { GameResults } from "@/components/game-results";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export default function Game() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(5);
  const [currentRoundData, setCurrentRoundData] =
    useState<StartGameResponse["round"] | null>(null);
  const [guessLocation, setGuessLocation] = useState<GuessLocation | null>(null);
  const [gameState, setGameState] = useState<GameState>("loading");
  const [scores, setScores] = useState<GuessResponse[]>([]);
  const [currentResult, setCurrentResult] = useState<GuessResponse | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(60);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [savedUsername, setSavedUsername] = useState("Guest");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [isSavingScore, setIsSavingScore] = useState(false);

  const totalScore = scores.reduce((sum, round) => sum + round.score, 0);

  const startGame = async () => {
    setGameState("loading");
    setErrorMessage(null);
    setUsernameInput("");
    setSavedUsername("Guest");
    setSaveMessage(null);
    setSaveErrorMessage(null);
    setIsSavingScore(false);

    try {
      const game = await startGameRequest();
      setSessionId(game.sessionId);
      setCurrentRound(game.currentRound);
      setTotalRounds(game.totalRounds);
      setCurrentRoundData(game.round);
      setGuessLocation(null);
      setScores([]);
      setCurrentResult(null);
      setTimeRemaining(game.timeLimit);
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

  useEffect(() => {
    if (gameState !== "guessing") {
      return;
    }

    if (timeRemaining <= 0) {
      void handleSubmitGuess();
      return;
    }

    const timer = setTimeout(() => {
      setTimeRemaining((current) => current - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [gameState, timeRemaining]);

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
      setTimeRemaining(nextRound.timeLimit);
      setGameState("guessing");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load the next round.";
      setErrorMessage(message);
      setGameState("error");
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground dark:bg-[#001233] dark:text-white">
      <Header />
      <div className="container mx-auto p-4">
        <div className="mb-4 flex items-center">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </Link>
          <div className="ml-auto">
            <GameProgress
              currentRound={currentRound}
              totalRounds={totalRounds}
              scores={scores}
            />
          </div>
        </div>

        {gameState === "loading" && (
          <div className="rounded-lg border border-border/70 bg-card/90 p-6 shadow-lg dark:bg-gray-800">
            <p className="text-lg font-medium">Loading round...</p>
            <p className="mt-2 text-sm text-muted-foreground dark:text-gray-300">
              Preparing Toronto Street View and map data.
            </p>
          </div>
        )}

        {gameState === "error" && (
          <div className="rounded-lg border border-border/70 bg-card/90 p-6 shadow-lg dark:bg-gray-800">
            <h2 className="text-2xl font-bold">Something went wrong</h2>
            <p className="mt-3 text-sm text-muted-foreground dark:text-gray-300">
              {errorMessage ?? "The game could not continue."}
            </p>
            <div className="mt-4">
              <Button onClick={() => void startGame()}>Try Again</Button>
            </div>
          </div>
        )}

        {(gameState === "guessing" || gameState === "submitting") &&
          currentRoundData && (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <GamePanorama
                  panoId={currentRoundData.panoId}
                  heading={currentRoundData.heading}
                  pitch={currentRoundData.pitch}
                  zoom={currentRoundData.zoom}
                />
              </div>
              <div className="space-y-4">
                <GameMap
                  onMapClick={handleMapClick}
                  guessLocation={guessLocation}
                  actualLocation={null}
                  isGuessing={true}
                />
                <GameControls
                  onSubmitGuess={() => void handleSubmitGuess()}
                  hasGuess={!!guessLocation}
                  timeRemaining={timeRemaining}
                  isSubmitting={gameState === "submitting"}
                />
              </div>
            </div>
          )}

        {gameState === "results" && currentResult && (
          <GameResults
            guessLocation={currentResult.guessLocation}
            actualLocation={currentResult.actualLocation}
            score={currentResult.score}
            distance={currentResult.distance}
            onNextRound={() => void handleNextRound()}
            isLastRound={currentResult.isLastRound}
          />
        )}

        {gameState === "summary" && (
          <div className="rounded-lg border border-border/70 bg-card/90 p-6 shadow-lg dark:bg-gray-800">
            <h2 className="mb-4 text-2xl font-bold">Game Summary</h2>
            <div className="mb-6">
              <p className="text-xl">Total Score: {totalScore}</p>
              <p className="mt-1 text-sm text-muted-foreground dark:text-gray-400">
                Leaderboard name: {savedUsername}
              </p>
            </div>

            <div className="mb-6 space-y-4">
              <h3 className="text-lg font-semibold">Round Results:</h3>
              {scores.map((round) => (
                <div
                  key={round.roundNumber}
                  className="flex items-center justify-between border-b border-border/70 pb-2"
                >
                  <div>
                    <p className="font-medium">Round {round.roundNumber}</p>
                    <p className="text-sm text-muted-foreground dark:text-gray-400">
                      {round.distance === null
                        ? "No guess submitted"
                        : `Distance: ${round.distance.toFixed(2)} km`}
                    </p>
                  </div>
                  <p className="font-bold">{round.score} points</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col items-center gap-4">
              <div className="order-1 w-full max-w-sm space-y-2">
                <p className="text-sm font-medium">Save score?</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={usernameInput}
                    onChange={(event) => handleUsernameChange(event.target.value)}
                    placeholder="Guest"
                    maxLength={10}
                    className="sm:flex-1"
                  />
                  <Button
                    type="button"
                    onClick={() => void handleSaveScore()}
                    disabled={isSavingScore}
                    className="sm:min-w-[120px]"
                  >
                    {isSavingScore ? "Saving..." : "Save Score"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground dark:text-gray-400">
                  Letters and numbers only, up to 10 characters. Leave it blank
                  for Guest.
                </p>
                {saveMessage && (
                  <p className="text-sm text-emerald-600 dark:text-emerald-400">
                    {saveMessage}
                  </p>
                )}
                {saveErrorMessage && (
                  <p className="text-sm text-red-500">{saveErrorMessage}</p>
                )}
              </div>

              <Button
                onClick={() => void startGame()}
                className="order-2 self-center bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-700"
              >
                Play Again
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
