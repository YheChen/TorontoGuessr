"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GameMap } from "@/components/game-map";
import { ArrowRight, MapPin, Navigation } from "lucide-react";

interface GameResultsProps {
  guessLocation: { lat: number; lng: number } | null;
  actualLocation: { lat: number; lng: number };
  score: number;
  distance: number | null;
  onNextRound: () => void;
  isLastRound: boolean;
}

export function GameResults({
  guessLocation,
  actualLocation,
  score,
  distance,
  onNextRound,
  isLastRound,
}: GameResultsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="dark:bg-gray-800 light:bg-white">
        <CardHeader>
          <CardTitle>Round Results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-gray-500 dark:text-gray-400 light:text-gray-500">
                Your Score
              </p>
              <p className="text-2xl font-bold">{score} points</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-gray-500 dark:text-gray-400 light:text-gray-500">
                Distance
              </p>
              <p className="text-2xl font-bold">
                {distance === null ? "No guess" : `${distance.toFixed(2)} km`}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <MapPin className="mr-1 h-4 w-4 text-red-500" />
              <span className="text-sm">Your guess</span>
            </div>
            <div className="flex items-center">
              <Navigation className="mr-1 h-4 w-4 text-green-500" />
              <span className="text-sm">Actual location</span>
            </div>
          </div>

          <div className="rounded-md bg-gray-100 p-4 dark:bg-gray-700 light:bg-gray-100">
            <p className="text-sm text-gray-600 dark:text-gray-300 light:text-gray-600">
              {guessLocation === null
                ? "Time ran out before you placed a guess."
                : score > 4000
                ? "Excellent! You were very close to the actual location."
                : score > 2000
                ? "Good job! You were in the right area."
                : "Keep trying! Look for landmarks and architectural styles next time."}
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={onNextRound}
            className="w-full bg-[#3bc054] text-white hover:bg-[#2b873c]"
          >
            {isLastRound ? "See Final Results" : "Next Round"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>

      <div>
        <GameMap
          guessLocation={guessLocation}
          actualLocation={actualLocation}
          isGuessing={false}
        />
      </div>
    </div>
  );
}
