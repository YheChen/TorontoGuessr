export function generateStreetViewURL(
  lat: number,
  lng: number,
  heading: number = 0,
  pitch: number = 0,
  fov: number = 90,
  size: string = "800x600"
): string {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  return `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${lat},${lng}&fov=${fov}&heading=${heading}&pitch=${pitch}&key=${apiKey}`;
}
