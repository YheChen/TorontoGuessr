"use client";

import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { TowerGlyph } from "@/components/site/brand-mark";

interface GameHUDProps {
  currentRound: number;
  totalRounds: number;
  scores: Array<{ score: number }>;
  timeRemaining?: number;
  timeLimit?: number;
  showTimer?: boolean;
}

const chip =
  "pointer-events-auto inline-flex items-center gap-2 rounded-full bg-background/75 px-3.5 py-2 text-sm font-semibold text-foreground shadow-elevated ring-1 ring-border/70 backdrop-blur-md";

function tierColor(score: number): string {
  if (score >= 4000) return "bg-success";
  if (score >= 2000) return "bg-primary";
  if (score > 0) return "bg-toronto-gold";
  return "bg-muted-foreground/40";
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function GameHUD({
  currentRound,
  totalRounds,
  scores,
  timeRemaining = 0,
  timeLimit = 60,
  showTimer = false,
}: GameHUDProps) {
  const totalScore = scores.reduce((sum, round) => sum + round.score, 0);
  const lowTime = showTimer && timeRemaining <= 10;
  const pct = timeLimit > 0 ? Math.max(0, Math.min(1, timeRemaining / timeLimit)) : 0;
  const radius = 9;
  const circumference = 2 * Math.PI * radius;

  // Announce only at meaningful thresholds, not on every tick.
  const timerAnnouncement = !showTimer
    ? ""
    : timeRemaining <= 0
      ? "Time is up. Submitting your guess."
      : timeRemaining <= 5
        ? `${timeRemaining} seconds left.`
        : timeRemaining === 10
          ? "10 seconds left."
          : "";

  return (
    <div className="flex items-start justify-between gap-2">
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {timerAnnouncement}
      </span>
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

        {showTimer && (
          <span
            className={cn(
              chip,
              "tabular",
              lowTime && "text-toronto-red ring-toronto-red/40",
            )}
          >
            <span className="relative inline-grid place-items-center">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                className="-rotate-90"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={0.18}
                  strokeWidth="2.5"
                />
                <circle
                  cx="12"
                  cy="12"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - pct)}
                  className="transition-[stroke-dashoffset] duration-1000 ease-linear"
                />
              </svg>
              <Clock className="absolute size-3" />
            </span>
            {formatTime(timeRemaining)}
          </span>
        )}
      </div>
    </div>
  );
}
