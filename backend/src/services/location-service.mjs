import { addDoc, collection, getDocs, updateDoc } from "firebase/firestore";
import { db } from "../firebase.mjs";
import { getValidatedPanorama } from "./streetview-service.mjs";

const TORONTO_BOUNDS = {
  north: 43.679751,
  south: 43.636327,
  west: -79.413625,
  east: -79.350063,
};

const verifiedLocationsRef = collection(db, "verifiedLocations");

function generateRandomLocation() {
  const lat =
    Math.random() * (TORONTO_BOUNDS.north - TORONTO_BOUNDS.south) +
    TORONTO_BOUNDS.south;
  const lng =
    Math.random() * (TORONTO_BOUNDS.east - TORONTO_BOUNDS.west) +
    TORONTO_BOUNDS.west;

  return { lat, lng };
}

function shuffle(items) {
  return [...items].sort(() => 0.5 - Math.random());
}

function toRound(location) {
  return {
    lat: location.lat,
    lng: location.lng,
    panoId: location.panoId,
    heading: Math.floor(Math.random() * 360),
    pitch: 0,
    zoom: 1,
  };
}

async function normalizeStoredLocation(candidate) {
  if (candidate.panoId) {
    return {
      lat: candidate.lat,
      lng: candidate.lng,
      panoId: candidate.panoId,
    };
  }

  const validated = await getValidatedPanorama({
    lat: candidate.lat,
    lng: candidate.lng,
  });

  if (!validated) {
    return null;
  }

  try {
    await updateDoc(candidate.ref, {
      lat: validated.lat,
      lng: validated.lng,
      panoId: validated.panoId,
    });
  } catch {
    // Read-only Firestore rules should not block gameplay.
  }

  return validated;
}

async function createVerifiedLocation() {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = generateRandomLocation();
    const validated = await getValidatedPanorama(candidate);

    if (!validated) {
      continue;
    }

    try {
      await addDoc(verifiedLocationsRef, {
        lat: validated.lat,
        lng: validated.lng,
        panoId: validated.panoId,
      });
    } catch {
      // Continue without caching when backend writes are disallowed.
    }

    return validated;
  }

  throw new Error("Unable to generate a verified Toronto location.");
}

export async function selectGameRounds(count = 5) {
  const snapshot = await getDocs(verifiedLocationsRef);
  const cachedLocations = shuffle(
    snapshot.docs.map((document) => {
      const data = document.data();
      return {
        ref: document.ref,
        lat: data.lat,
        lng: data.lng,
        panoId: data.panoId ?? null,
      };
    })
  );

  const rounds = [];
  const seenPanoramas = new Set();

  for (const candidate of cachedLocations) {
    if (rounds.length >= count) {
      break;
    }

    const normalized = await normalizeStoredLocation(candidate);
    if (!normalized) {
      continue;
    }

    if (seenPanoramas.has(normalized.panoId)) {
      continue;
    }

    seenPanoramas.add(normalized.panoId);
    rounds.push(toRound(normalized));
  }

  while (rounds.length < count) {
    const validated = await createVerifiedLocation();
    if (seenPanoramas.has(validated.panoId)) {
      continue;
    }

    seenPanoramas.add(validated.panoId);
    rounds.push(toRound(validated));
  }

  return rounds;
}
