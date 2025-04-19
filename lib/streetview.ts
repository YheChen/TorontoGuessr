// lib/streetview.ts
export function generateStreetViewUrl(
  lat: number,
  lng: number,
  heading: number = 0,
  pitch: number = 0
): string {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  return `https://maps.googleapis.com/maps/api/streetview?size=800x600&location=${lat},${lng}&fov=90&heading=${heading}&pitch=${pitch}&source=outdoor&key=${apiKey}`;
}
