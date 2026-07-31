/** Geometry helpers for placing things on the guess map. */

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Halfway between two points, for anchoring a label to the line joining them.
 *
 * A plain average of the coordinates, NOT a geodesic midpoint, and that is a
 * deliberate limit rather than an oversight:
 *
 *   * The correct version needs google.maps.geometry.spherical.interpolate,
 *     which means adding `geometry` to the loader libraries. useJsApiLoader is
 *     called from four separate components, and @react-google-maps/api throws
 *     when two loads request different options, so one library addition would
 *     have to be threaded through all four.
 *   * Over the distances this game plays at, a few km inside one city, the two
 *     answers differ by far less than a pixel.
 *
 * NOT SAFE for antimeridian-crossing pairs: averaging 179 and -179 gives 0, the
 * opposite side of the planet. Every location here is in Toronto, so that cannot
 * arise, but do not lift this into a global context without fixing it.
 */
export function midpoint(a: LatLng, b: LatLng): LatLng {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}
