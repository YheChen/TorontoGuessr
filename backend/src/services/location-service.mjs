import { insertRow, selectRows, updateSingleRow } from "../supabase.mjs";
import { getValidatedPanorama } from "./streetview-service.mjs";

const TORONTO_BOUNDS = {
  north: 43.679751,
  south: 43.636327,
  west: -79.413625,
  east: -79.350063,
};

const VERIFIED_LOCATIONS_TABLE = "verified_locations";
const VERIFIED_LOCATION_COLUMNS = "id,lat,lng,pano_id";
const locationGenerationEnabled =
  process.env.LOCATION_GENERATION_ENABLED !== "false";
let locationWritesEnabled = true;
let hasWarnedAboutWriteFailures = false;

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

function disableLocationWrites(error) {
  locationWritesEnabled = false;

  if (hasWarnedAboutWriteFailures) {
    return;
  }

  hasWarnedAboutWriteFailures = true;
  const message = error instanceof Error ? error.message : "Unexpected write failure.";

  console.warn(
    `[location-service] Supabase writes disabled for this process: ${message}`
  );
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

  if (locationWritesEnabled) {
    try {
      await updateSingleRow(
        VERIFIED_LOCATIONS_TABLE,
        {
          lat: validated.lat,
          lng: validated.lng,
          pano_id: validated.panoId,
        },
        {
          filters: { id: candidate.id },
          columns: VERIFIED_LOCATION_COLUMNS,
        }
      );
    } catch (error) {
      disableLocationWrites(error);
      // Cache write failures should not block gameplay.
    }
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

    if (locationWritesEnabled) {
      try {
        await insertRow(
          VERIFIED_LOCATIONS_TABLE,
          {
            lat: validated.lat,
            lng: validated.lng,
            pano_id: validated.panoId,
          },
          {
            columns: VERIFIED_LOCATION_COLUMNS,
          }
        );
      } catch (error) {
        disableLocationWrites(error);
        // Continue without caching when backend writes are unavailable.
      }
    }

    return validated;
  }

  throw new Error("Unable to generate a verified Toronto location.");
}

export async function selectGameRounds(count = 5) {
  const cachedLocations = shuffle(
    (
      await selectRows(VERIFIED_LOCATIONS_TABLE, {
        columns: VERIFIED_LOCATION_COLUMNS,
      })
    ).map((row) => ({
      id: row.id,
      lat: row.lat,
      lng: row.lng,
      panoId: row.pano_id ?? null,
    }))
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
    if (!locationGenerationEnabled) {
      throw new Error(
        `Not enough verified locations in Supabase to start a ${count}-round game without generation.`
      );
    }

    const validated = await createVerifiedLocation();
    if (seenPanoramas.has(validated.panoId)) {
      continue;
    }

    seenPanoramas.add(validated.panoId);
    rounds.push(toRound(validated));
  }

  return rounds;
}
