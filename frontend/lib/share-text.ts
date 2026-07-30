import type { GameMode } from "@/lib/types";

/**
 * Emoji tile for a round score, matching the results verdict tiers.
 *
 * The thresholds are the same four the results card uses (see getVerdict in
 * components/round-result-card.tsx), which they previously only claimed to be:
 * the middle band was 2000 while the card cut at 2500.
 *
 * Aligning them also keeps the grid informative under the current scoring curve.
 * Scores only reach 0 on a timeout or an absurd misclick now, so a `> 0` bottom
 * band would have made almost every played round the same colour. As it stands
 * the bands are roughly: within 0.6 km, 1.1 km, 2.1 km, and worse.
 */
export function tileFor(score: number): string {
  if (score >= 4000) return "🟩";
  if (score >= 2500) return "🟦";
  if (score >= 1000) return "🟨";
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
