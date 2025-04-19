"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MapPin, Clock } from "lucide-react";

interface GameControlsProps {
  onSubmitGuess: () => void;
  hasGuess: boolean;
  timeRemaining: number;
}

export function GameControls({
  onSubmitGuess,
  hasGuess,
  timeRemaining,
}: GameControlsProps) {
  const timePercentage = (timeRemaining / 60) * 100;

  return (
    <Card className="dark:bg-gray-800 light:bg-white">
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Clock className="mr-2 h-4 w-4 text-gray-500 dark:text-gray-400 light:text-gray-500" />
                <span className="text-sm font-medium">Time Remaining</span>
              </div>
              <span className="text-sm font-medium">{timeRemaining}s</span>
            </div>
            <Progress value={timePercentage} className="h-2" />
          </div>

          <div className="rounded-md bg-gray-100 dark:bg-gray-700 light:bg-gray-100 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-300 light:text-gray-600">
              {hasGuess
                ? "Your guess is placed! Submit when ready."
                : "Click on the map to place your guess."}
            </p>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button
          onClick={onSubmitGuess}
          disabled={!hasGuess}
          className="w-full bg-[#3bc054] hover:bg-[#2b873c] disabled:bg-gray-300"
        >
          <MapPin className="mr-2 h-4 w-4" />
          Submit Guess
        </Button>
      </CardFooter>
    </Card>
  );
}
