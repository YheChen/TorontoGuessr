// lib/streetview.ts

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;

/**
 * Checks if a location has Street View imagery.
 */
export async function hasStreetView(
  lat: number,
  lng: number
): Promise<boolean> {
  const metadataUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&key=${GOOGLE_API_KEY}`;

  const response = await fetch(metadataUrl);
  const data = await response.json();

  return data.status === "OK";
}

/**
 * Optionally generate a Street View image URL (for testing or UI display).
 */
export function getStreetViewImageUrl(
  lat: number,
  lng: number,
  heading = 0,
  pitch = 0,
  fov = 90
): string {
  return `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${lat},${lng}&heading=${heading}&pitch=${pitch}&fov=${fov}&key=${GOOGLE_API_KEY}`;
}
