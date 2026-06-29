"use client";

import { Crosshair, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GameMap } from "@/components/game-map";

interface GuessPanelProps {
  guessLocation: { lat: number; lng: number } | null;
  onMapClick: (lat: number, lng: number) => void;
  onSubmitGuess: () => void;
  isSubmitting: boolean;
  className?: string;
}

export function GuessPanel({
  guessLocation,
  onMapClick,
  onSubmitGuess,
  isSubmitting,
  className,
}: GuessPanelProps) {
  const hasGuess = !!guessLocation;

  return (
    <div
      className={cn(
        "glass-strong pointer-events-auto flex flex-col overflow-hidden rounded-2xl shadow-elevated",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          <MapPin className="size-3.5 text-toronto-red" />
          Your guess
        </span>
        <span
          className={cn(
            "text-xs font-medium transition-colors",
            hasGuess ? "text-success" : "text-muted-foreground",
          )}
        >
          {hasGuess ? "Pin placed" : "Tap the map"}
        </span>
      </div>

      <div className="min-h-[240px] flex-1 p-2.5">
        <GameMap
          onMapClick={onMapClick}
          guessLocation={guessLocation}
          actualLocation={null}
          isGuessing
        />
      </div>

      <div className="px-2.5 pb-2.5">
        <Button
          onClick={onSubmitGuess}
          disabled={!hasGuess || isSubmitting}
          size="lg"
          className="w-full rounded-xl shadow-glow"
        >
          <Crosshair className="size-4" />
          {isSubmitting
            ? "Submitting…"
            : hasGuess
              ? "Submit guess"
              : "Place a pin to guess"}
        </Button>
      </div>
    </div>
  );
}
