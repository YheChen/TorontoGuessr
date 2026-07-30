"use client";

import { useState } from "react";
import { Check, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createChallenge } from "@/lib/api";
import { buildChallengeUrl } from "@/lib/game-params";

interface ChallengeFriendProps {
  sessionId: string;
  totalScore: number;
  maxScore: number;
}

/**
 * Turns the finished game into a shareable link that replays the exact same
 * five locations, so a friend's score is directly comparable.
 */
export function ChallengeFriend({
  sessionId,
  totalScore,
  maxScore,
}: ChallengeFriendProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleChallenge = async () => {
    setIsCreating(true);
    setErrorMessage(null);

    try {
      const { code } = await createChallenge(sessionId);
      const url = buildChallengeUrl(window.location.origin, code);
      const text = [
        `I scored ${totalScore.toLocaleString("en-US")} / ${maxScore.toLocaleString("en-US")} on TorontoGuessr.`,
        "Same five locations. Beat me:",
        url,
      ].join("\n");

      // Prefer the native share sheet, falling back to the clipboard.
      if (navigator.share) {
        try {
          await navigator.share({ title: "TorontoGuessr challenge", text });
          return;
        } catch {
          // Share cancelled or unavailable; fall through to copying.
        }
      }

      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not create a challenge link.";
      setErrorMessage(message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        type="button"
        onClick={() => void handleChallenge()}
        disabled={isCreating}
        size="xl"
        variant="outline"
        className="rounded-2xl"
      >
        {copied ? (
          <>
            <Check className="size-5 text-success" />
            Link copied!
          </>
        ) : (
          <>
            <Swords className="size-5" />
            {isCreating ? "Creating link…" : "Challenge a friend"}
          </>
        )}
      </Button>
      {errorMessage && (
        <p className="text-xs font-medium text-destructive">{errorMessage}</p>
      )}
    </div>
  );
}
