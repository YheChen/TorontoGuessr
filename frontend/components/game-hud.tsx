"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TowerGlyph } from "@/components/site/brand-mark";

interface GameHUDProps {
  currentRound: number;
  totalRounds: number;
  scores: Array<{ score: number }>;
  /** Rendered under the score chip; used for the round countdown. */
  timerSlot?: ReactNode;
}

const chip =
  "pointer-events-auto inline-flex items-center gap-2 rounded-full bg-background/75 px-3.5 py-2 text-sm font-semibold text-foreground shadow-elevated ring-1 ring-border/70 backdrop-blur-md";

function tierColor(score: number): string {
  if (score >= 4000) return "bg-success";
  if (score >= 2000) return "bg-primary";
  if (score > 0) return "bg-toronto-gold";
  return "bg-muted-foreground/40";
}

export function GameHUD({
  currentRound,
  totalRounds,
  scores,
  timerSlot,
}: GameHUDProps) {
  const totalScore = scores.reduce((sum, round) => sum + round.score, 0);

  return (
    <div className="flex items-start justify-between gap-2">
      {/* Round + progress */}
      <div className="flex flex-col items-start gap-2">
        <span className={chip}>
          <span className="text-muted-foreground">Round</span>
          <span className="tabular">
            {currentRound}
            <span className="text-muted-foreground"> / {totalRounds}</span>
          </span>
        </span>
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-background/75 px-3 py-2 shadow-elevated ring-1 ring-border/70 backdrop-blur-md">
          {Array.from({ length: totalRounds }).map((_, index) => {
            const played = scores[index];
            const isCurrent = index + 1 === currentRound && !played;
            return (
              <span
                key={index}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  played
                    ? `w-5 ${tierColor(played.score)}`
                    : isCurrent
                      ? "w-5 bg-primary/70"
                      : "w-2.5 bg-muted-foreground/25",
                )}
              />
            );
          })}
        </div>
      </div>

      {/* Score + timer */}
      <div className="flex flex-col items-end gap-2">
        <span className={chip}>
          <TowerGlyph className="size-4 text-primary" />
          <span className="tabular">{totalScore.toLocaleString("en-US")}</span>
        </span>
        {timerSlot}
      </div>
    </div>
  );
}
