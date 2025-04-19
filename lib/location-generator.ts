// lib/location-generator.ts

import { hasStreetView } from "@/lib/streetview";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs } from "firebase/firestore";

const TORONTO_BOUNDS = {
  north: 43.679751, // Northeast corner
  south: 43.636327, // Southwest corner
  west: -79.413625, // Northwest corner
  east: -79.350063, // Southeast corner
};

export interface Location {
  lat: number;
  lng: number;
}

export async function generateRandomLocation(): Promise<Location> {
  const lat =
    Math.random() * (TORONTO_BOUNDS.north - TORONTO_BOUNDS.south) +
    TORONTO_BOUNDS.south;
  const lng =
    Math.random() * (TORONTO_BOUNDS.east - TORONTO_BOUNDS.west) +
    TORONTO_BOUNDS.west;
  return { lat, lng };
}

export async function validateStreetView(location: Location): Promise<boolean> {
  return await hasStreetView(location.lat, location.lng);
}

export async function getVerifiedLocations(count = 10): Promise<Location[]> {
  const verifiedRef = collection(db, "verifiedLocations");
  const snap = await getDocs(verifiedRef);

  const allLocations: Location[] = snap.docs.map((doc) => {
    const data = doc.data();
    return { lat: data.lat, lng: data.lng };
  });

  // Shuffle and select unique random entries
  const shuffled = allLocations.sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, count);

  // If not enough cached, generate more
  while (selected.length < count) {
    const candidate = await generateRandomLocation();
    const isValid = await validateStreetView(candidate);
    if (isValid) {
      await addDoc(verifiedRef, candidate);
      selected.push(candidate);
    }
  }

  return selected;
}
