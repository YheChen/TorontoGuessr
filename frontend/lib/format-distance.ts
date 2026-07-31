/**
 * How a guess-to-answer distance is written, everywhere.
 *
 * Extracted because there were three identical copies of this by the time a
 * fourth was needed for the map labels: round-result-card.tsx,
 * lobby-scoreboard.tsx, and inline in the game page's summary table. Three copies
 * agreeing today is not the same as three copies agreeing after someone changes
 * one of them.
 *
 * The input is kilometres, which is what the backend stores on every round result
 * and what it scores from.
 */

/** Longer form for a card: "820 m", "1.42 km", or a stated absence. */
export function formatDistance(distance: number | null | undefined): string {
  if (distance === null || distance === undefined || !Number.isFinite(distance)) {
    return "No guess";
  }
  // Metres under a kilometre. Two decimals of a kilometre would read as 0.82,
  // which is harder to picture than 820 m at exactly the scale this game plays at.
  if (distance < 1) {
    return `${Math.round(distance * 1000)} m`;
  }
  return `${distance.toFixed(2)} km`;
}

/**
 * Shorter form for a label drawn on the map itself.
 *
 * One decimal, not two. These sit on top of the map between a pin and the answer,
 * often several at once in a lobby reveal, so every character is one more chance
 * of overlapping the next label. "1.4 km" carries the same meaning as "1.42 km"
 * at a glance and is 20% narrower.
 *
 * Returns null rather than "No guess" when there is nothing to show: the caller
 * draws no line without a distance, so there is no line to label.
 */
export function formatDistanceCompact(
  distance: number | null | undefined
): string | null {
  if (distance === null || distance === undefined || !Number.isFinite(distance)) {
    return null;
  }
  if (distance < 1) {
    return `${Math.round(distance * 1000)} m`;
  }
  return `${distance.toFixed(1)} km`;
}
