import type { GameMode } from "@/lib/types";

/** Emoji tile for a round score, matching the results verdict tiers. */
export function tileFor(score: number): string {
  if (score >= 4000) return "🟩";
  if (score >= 2000) return "🟦";
  if (score > 0) return "🟨";
  return "⬛";
}

export interface ShareTextInput {
  totalScore: number;
  maxScore: number;
  scores: Array<{ score: number }>;
  mode: GameMode;
  challengeDate: string | null;
}

/** Builds the Wordle-style shareable summary of a finished game. */
export function buildShareText({
  totalScore,
  maxScore,
  scores,
  mode,
  challengeDate,
}: ShareTextInput): string {
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
