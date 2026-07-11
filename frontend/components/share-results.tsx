"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GameMode, GuessResponse } from "@/lib/types";

interface ShareResultsProps {
  totalScore: number;
  maxScore: number;
  scores: GuessResponse[];
  mode: GameMode;
  challengeDate: string | null;
}

function tileFor(score: number): string {
  if (score >= 4000) return "🟩";
  if (score >= 2000) return "🟦";
  if (score > 0) return "🟨";
  return "⬛";
}

function buildShareText({
  totalScore,
  maxScore,
  scores,
  mode,
  challengeDate,
}: ShareResultsProps): string {
  const heading =
    mode === "daily" && challengeDate
      ? `TorontoGuessr Daily Challenge ${challengeDate}`
      : "TorontoGuessr";
  const tiles = scores.map((round) => tileFor(round.score)).join("");
  const origin =
    typeof window === "undefined"
      ? "https://www.torontoguessr.ca"
      : window.location.origin;

  return [
    heading,
    `${totalScore.toLocaleString("en-US")} / ${maxScore.toLocaleString("en-US")}`,
    tiles,
    origin,
  ].join("\n");
}

/** Copies (or natively shares) a Wordle-style summary of the finished game. */
export function ShareResults(props: ShareResultsProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const text = buildShareText(props);

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // Cancelled or unsupported payload: fall through to the clipboard.
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard unavailable (permissions); nothing sensible to do.
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="xl"
      onClick={() => void handleShare()}
      className="rounded-2xl"
    >
      {copied ? (
        <>
          <Check className="size-5 text-success" />
          Copied!
        </>
      ) : (
        <>
          <Share2 className="size-5" />
          Share result
        </>
      )}
    </Button>
  );
}
