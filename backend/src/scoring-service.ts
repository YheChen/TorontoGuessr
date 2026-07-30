export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const radiusKm = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radiusKm * c;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/** Maximum for a single round. Five rounds still cap at 25000. */
export const MAX_ROUND_SCORE = 5000;

/**
 * Distances at or inside this are indistinguishable in practice, so they all pay
 * full marks. Street View panoramas sit roughly 10 to 20 m apart and the subject
 * of a photo can be a block from the camera, so demanding better than this would
 * be scoring noise.
 */
const PLATEAU_KM = 0.1;

/**
 * Error that halves the score, measured from the edge of the plateau.
 *
 * Toronto's 158 named neighbourhoods cover about 630 km2, averaging 4 km2 each,
 * which is an equivalent radius of ~1.13 km. So "you found the right
 * neighbourhood" and "you scored about half" mean the same thing, by
 * construction.
 */
const HALF_SCORE_KM = 1;

/**
 * Points for a guess that missed by `distance` kilometres.
 *
 * The shape is 1/(1 + x^2): flat across the plateau, steep through the first
 * kilometre where local knowledge actually shows, then a quadratic tail where
 * every doubling of error quarters the payout.
 *
 * It replaces a linear ramp that hit zero at 2 km and stayed there. That was the
 * wrong scale for this game by an order of magnitude. The target set spans about
 * 4.8 by 5.1 km (TORONTO_BOUNDS in services/location-service.ts), so a random
 * in-area click lands ~2.6 km out on average, and the old curve scored that
 * identically to a guess in another country: zero. Recognising the right
 * neighbourhood and missing by 2.1 km also scored zero. The game could not tell
 * knowledge from ignorance, which is the one thing it exists to measure.
 *
 * Now 1 km pays 2762, that average uninformed click pays ~690, and a 20 km miss
 * pays 13. Informed play earns roughly four times ignorant play, and genuine
 * ignorance still rounds towards nothing without a cliff.
 *
 * Written as `decay * decay` rather than `Math.pow`, and with no exp or log,
 * because this formula is duplicated in SQL (see add_submit_guess_function.sql).
 * Restricted to multiplication and division, both languages perform identical
 * IEEE 754 operations and cannot drift apart by a point.
 */
export function calculateScore(distance: number): number {
  // Fail closed. NaN reaches total_score as null and blanks a score, and a
  // negative distance must never fall through to the plateau branch and hand out
  // a perfect round. Callers already map a missing guess to 0 without coming
  // here, so this only guards genuinely broken input.
  if (!Number.isFinite(distance) || distance < 0) {
    return 0;
  }

  if (distance <= PLATEAU_KM) {
    return MAX_ROUND_SCORE;
  }

  const decay = (distance - PLATEAU_KM) / HALF_SCORE_KM;
  return Math.round(MAX_ROUND_SCORE / (1 + decay * decay));
}
