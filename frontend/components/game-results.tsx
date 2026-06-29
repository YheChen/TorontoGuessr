"use client";

import {
  ArrowRight,
  MapPin,
  Navigation,
  Target,
  Trophy,
  Flag,
  Sparkles,
  Clock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GameMap } from "@/components/game-map";
import { CountUp } from "@/components/site/count-up";
import { cn } from "@/lib/utils";

interface GameResultsProps {
  guessLocation: { lat: number; lng: number } | null;
  actualLocation: { lat: number; lng: number };
  score: number;
  distance: number | null;
  onNextRound: () => void;
  isLastRound: boolean;
  roundNumber?: number;
  totalRounds?: number;
}

const MAX_SCORE = 5000;

interface Verdict {
  label: string;
  icon: LucideIcon;
  tone: string;
}

function getVerdict(score: number, hasGuess: boolean): Verdict {
  if (!hasGuess)
    return {
      label: "Out of time",
      icon: Clock,
      tone: "text-destructive bg-destructive/12 ring-destructive/25",
    };
  if (score >= 4000)
    return {
      label: "Bang on!",
      icon: Trophy,
      tone: "text-success bg-success/12 ring-success/25",
    };
  if (score >= 2500)
    return {
      label: "Great guess",
      icon: Sparkles,
      tone: "text-primary bg-primary/12 ring-primary/25",
    };
  if (score >= 1000)
    return {
      label: "Not bad",
      icon: Target,
      tone: "text-medal-gold bg-medal-gold/12 ring-medal-gold/25",
    };
  return {
    label: "Keep exploring",
    icon: MapPin,
    tone: "text-muted-foreground bg-muted ring-border",
  };
}

function formatDistance(distance: number | null): string {
  if (distance === null) return "No guess";
  if (distance < 1) return `${Math.round(distance * 1000)} m`;
  return `${distance.toFixed(2)} km`;
}

export function GameResults({
  guessLocation,
  actualLocation,
  score,
  distance,
  onNextRound,
  isLastRound,
  roundNumber,
  totalRounds,
}: GameResultsProps) {
  const hasGuess = guessLocation !== null;
  const verdict = getVerdict(score, hasGuess);
  const VerdictIcon = verdict.icon;
  const scorePct = Math.max(0, Math.min(100, (score / MAX_SCORE) * 100));

  return (
    <div className="grid animate-fade-in gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
      {/* Result card */}
      <div className="surface-card animate-fade-up rounded-2xl p-6 sm:p-7">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {roundNumber && totalRounds
              ? `Round ${roundNumber} of ${totalRounds}`
              : "Round results"}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset",
              verdict.tone,
            )}
          >
            <VerdictIcon className="size-3.5" />
            {verdict.label}
          </span>
        </div>

        <div className="mt-6">
          <p className="text-sm text-muted-foreground">You scored</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-5xl font-bold tracking-tight tabular sm:text-6xl">
              <CountUp value={score} />
            </span>
            <span className="text-lg font-medium text-muted-foreground">
              / {MAX_SCORE.toLocaleString("en-US")}
            </span>
          </p>

          {/* score meter */}
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-toronto-azure to-toronto-sky transition-[width] duration-1000 ease-spring"
              style={{ width: `${scorePct}%` }}
            />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-border/70 bg-muted/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Distance
            </p>
            <p className="mt-1 text-xl font-bold tabular">
              {formatDistance(distance)}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Round score
            </p>
            <p className="mt-1 text-xl font-bold tabular">
              {score.toLocaleString("en-US")}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4 text-toronto-red" />
            Your guess
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Navigation className="size-4 text-success" />
            Actual location
          </span>
        </div>

        <Button
          onClick={onNextRound}
          size="lg"
          className="mt-6 w-full rounded-xl shadow-glow"
        >
          {isLastRound ? (
            <>
              <Flag className="size-4" />
              See final results
            </>
          ) : (
            <>
              Next round
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>

      {/* Comparison map */}
      <div className="surface-card animate-fade-up overflow-hidden rounded-2xl p-2.5 delay-150">
        <div className="h-[320px] w-full sm:h-[380px] lg:h-full lg:min-h-[460px]">
          <GameMap
            guessLocation={guessLocation}
            actualLocation={actualLocation}
            isGuessing={false}
          />
        </div>
      </div>
    </div>
  );
}
