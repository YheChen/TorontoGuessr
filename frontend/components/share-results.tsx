"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildShareText } from "@/lib/share-text";
import type { GameMode, GuessResponse } from "@/lib/types";

interface ShareResultsProps {
  totalScore: number;
  maxScore: number;
  scores: GuessResponse[];
  mode: GameMode;
  challengeDate: string | null;
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
