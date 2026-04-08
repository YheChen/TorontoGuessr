"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MapPin, Clock } from "lucide-react";

interface GameControlsProps {
  onSubmitGuess: () => void;
  hasGuess: boolean;
  timeRemaining: number;
  isSubmitting?: boolean;
}

export function GameControls({
  onSubmitGuess,
  hasGuess,
  timeRemaining,
  isSubmitting = false,
}: GameControlsProps) {
  const timePercentage = (timeRemaining / 60) * 100;

  return (
    <Card className="border-border/70 bg-card/95 shadow-md dark:bg-gray-800">
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Clock className="mr-2 h-4 w-4 text-muted-foreground dark:text-gray-400" />
                <span className="text-sm font-medium">Time Remaining</span>
              </div>
              <span className="text-sm font-medium">{timeRemaining}s</span>
            </div>
            <Progress value={timePercentage} className="h-2" />
          </div>

          <div className="rounded-md bg-secondary p-4 text-secondary-foreground dark:bg-gray-700 dark:text-gray-300">
            <p className="text-sm">
              {hasGuess
                ? isSubmitting
                  ? "Submitting your guess..."
                  : "Your guess is placed! Submit when ready."
                : "Click on the map to place your guess."}
            </p>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button
          onClick={onSubmitGuess}
          disabled={!hasGuess || isSubmitting}
          className="w-full bg-[#3bc054] hover:bg-[#2b873c] disabled:bg-slate-300"
        >
          <MapPin className="mr-2 h-4 w-4" />
          {isSubmitting ? "Submitting..." : "Submit Guess"}
        </Button>
      </CardFooter>
    </Card>
  );
}
