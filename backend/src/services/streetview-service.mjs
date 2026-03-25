import { loadEnv } from "../env.mjs";

loadEnv();

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export async function fetchStreetViewMetadata({ lat, lng }) {
  if (!GOOGLE_API_KEY) {
    throw new Error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY for backend.");
  }

  const metadataUrl = new URL(
    "https://maps.googleapis.com/maps/api/streetview/metadata"
  );
  metadataUrl.searchParams.set("location", `${lat},${lng}`);
  metadataUrl.searchParams.set("key", GOOGLE_API_KEY);

  const response = await fetch(metadataUrl);
  if (!response.ok) {
    throw new Error(`Street View metadata request failed with ${response.status}.`);
  }

  return response.json();
}

export async function getValidatedPanorama(location) {
  const metadata = await fetchStreetViewMetadata(location);
  if (metadata.status !== "OK" || !metadata.pano_id) {
    return null;
  }

  return {
    lat: metadata.location?.lat ?? location.lat,
    lng: metadata.location?.lng ?? location.lng,
    panoId: metadata.pano_id,
    copyright: metadata.copyright ?? null,
  };
}
