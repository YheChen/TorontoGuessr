"use client";

import { useState, useEffect } from "react";
import { GameMap } from "@/components/game-map";
import { GameControls } from "@/components/game-controls";
import { GameProgress } from "@/components/game-progress";
import { GameResults } from "@/components/game-results";
import { calculateScore, calculateDistance } from "@/lib/game-utils";
import { getVerifiedLocations } from "@/lib/location-generator";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import Header from "@/components/Header";
import GamePanorama from "@/components/gamepanorama";

export default function Game() {
  const router = useRouter();
  const [locations, setLocations] = useState<{ lat: number; lng: number }[]>(
    []
  );
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds] = useState(5);
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [guessLocation, setGuessLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [gameState, setGameState] = useState<
    "guessing" | "results" | "summary"
  >("guessing");
  const [scores, setScores] = useState<
    Array<{
      score: number;
      distance: number;
      location: { lat: number; lng: number };
    }>
  >([]);
  const [timeRemaining, setTimeRemaining] = useState(60);

  useEffect(() => {
    getVerifiedLocations(5).then(setLocations);
  }, []);

  useEffect(() => {
    if (locations.length && currentRound <= totalRounds) {
      setCurrentLocation(locations[currentRound - 1]);
      setTimeRemaining(60);
    }
  }, [currentRound, locations]);

  useEffect(() => {
    if (gameState === "guessing" && timeRemaining > 0) {
      const timer = setTimeout(() => setTimeRemaining(timeRemaining - 1), 1000);
      return () => clearTimeout(timer);
    } else if (gameState === "guessing" && timeRemaining === 0) {
      handleSubmitGuess();
    }
  }, [timeRemaining, gameState]);

  const handleMapClick = (lat: number, lng: number) => {
    if (gameState === "guessing") {
      setGuessLocation({ lat, lng });
    }
  };

  const handleSubmitGuess = () => {
    if (!currentLocation) return;

    if (!guessLocation) {
      // User made no guess → 0 points
      setScores([
        ...scores,
        { score: 0, distance: 0, location: currentLocation },
      ]);
    } else {
      const distance = calculateDistance(
        guessLocation.lat,
        guessLocation.lng,
        currentLocation.lat,
        currentLocation.lng
      );
      const score = calculateScore(distance);
      setScores([...scores, { score, distance, location: currentLocation }]);
    }

    setGameState("results");
  };

  const handleNextRound = () => {
    if (currentRound < totalRounds) {
      setCurrentRound(currentRound + 1);
      setGuessLocation(null);
      setGameState("guessing");
    } else {
      setGameState("summary");
    }
  };

  const handlePlayAgain = () => {
    setCurrentRound(1);
    setScores([]);
    setGuessLocation(null);
    setGameState("guessing");
    setTimeRemaining(60);
    getVerifiedLocations(5).then(setLocations);
  };

  const totalScore = scores.reduce((sum, round) => sum + round.score, 0);

  return (
    <main className="min-h-screen bg-white text-black dark:bg-[#001233] dark:text-white">
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

        {gameState === "guessing" && currentLocation && (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <GamePanorama
                lat={currentLocation.lat}
                lng={currentLocation.lng}
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
                onSubmitGuess={handleSubmitGuess}
                hasGuess={!!guessLocation}
                timeRemaining={timeRemaining}
              />
            </div>
          </div>
        )}

        {gameState === "results" &&
          currentLocation &&
          currentRound <= totalRounds && (
            <GameResults
              guessLocation={guessLocation!}
              actualLocation={currentLocation}
              score={scores[scores.length - 1].score}
              distance={scores[scores.length - 1].distance}
              onNextRound={handleNextRound}
              isLastRound={currentRound === totalRounds}
            />
          )}

        {gameState === "summary" && (
          <div className="rounded-lg bg-white dark:bg-gray-800 light:bg-white p-6 shadow-lg">
            <h2 className="mb-4 text-2xl font-bold">Game Summary</h2>
            <div className="mb-6">
              <p className="text-xl">Total Score: {totalScore}</p>
            </div>

            <div className="mb-6 space-y-4">
              <h3 className="text-lg font-semibold">Round Results:</h3>
              {scores.map((round, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between border-b pb-2"
                >
                  <div>
                    <p className="font-medium">Round {index + 1}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 light:text-gray-600">
                      Distance: {round.distance.toFixed(2)} km
                    </p>
                  </div>
                  <p className="font-bold">{round.score} points</p>
                </div>
              ))}
            </div>

            <div className="flex justify-center">
              <Button
                onClick={handlePlayAgain}
                className="bg-blue-800 hover:bg-blue-900 text-white dark:bg-blue-600 dark:hover:bg-blue-700"
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
