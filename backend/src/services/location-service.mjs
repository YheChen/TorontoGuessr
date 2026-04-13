import {
  countRows,
  deleteRows,
  insertRow,
  selectRows,
  selectSingleRow,
  updateSingleRow,
} from "../supabase.mjs";
import { getValidatedPanorama } from "./streetview-service.mjs";

const TORONTO_BOUNDS = {
  north: 43.679751,
  south: 43.636327,
  west: -79.413625,
  east: -79.350063,
};

const VERIFIED_LOCATIONS_TABLE = "verified_locations";
const VERIFIED_LOCATION_COLUMNS =
  "id,lat,lng,pano_id,manually_verified,review_status,created_at,updated_at";
const locationGenerationEnabled =
  process.env.LOCATION_GENERATION_ENABLED !== "false";
let locationWritesEnabled = true;
let hasWarnedAboutWriteFailures = false;
const REVIEW_STATUSES = {
  PENDING: "pending",
  REJECTED: "rejected",
  ACCEPTED: "accepted",
};

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

function mapVerifiedLocationRow(row) {
  return {
    id: row.id,
    lat: row.lat,
    lng: row.lng,
    panoId: row.pano_id ?? null,
    manuallyVerified: row.manually_verified ?? false,
    reviewStatus: row.review_status ?? REVIEW_STATUSES.PENDING,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
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
  const allCachedLocations = (
    await selectRows(VERIFIED_LOCATIONS_TABLE, {
      columns: VERIFIED_LOCATION_COLUMNS,
    })
  ).map(mapVerifiedLocationRow);
  const cachedLocations = [
    ...shuffle(
      allCachedLocations.filter(
        (row) =>
          row.manuallyVerified &&
          row.reviewStatus !== REVIEW_STATUSES.REJECTED
      )
    ),
    ...shuffle(
      allCachedLocations.filter(
        (row) =>
          !row.manuallyVerified &&
          row.reviewStatus !== REVIEW_STATUSES.REJECTED
      )
    ),
  ];

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

export async function getLocationReviewQueue({ index = 0 } = {}) {
  const total = await countRows(VERIFIED_LOCATIONS_TABLE, {
    filters: {
      manually_verified: false,
      review_status: REVIEW_STATUSES.PENDING,
    },
  });

  const clampedIndex = total === 0 ? 0 : Math.min(index, total - 1);
  const [entryRecord, rejectedCount] = await Promise.all([
    total === 0
      ? Promise.resolve(null)
      : selectSingleRow(VERIFIED_LOCATIONS_TABLE, {
          columns: VERIFIED_LOCATION_COLUMNS,
          filters: {
            manually_verified: false,
            review_status: REVIEW_STATUSES.PENDING,
          },
          order: "created_at.asc",
          offset: clampedIndex,
        }),
    countRows(VERIFIED_LOCATIONS_TABLE, {
      filters: {
        manually_verified: false,
        review_status: REVIEW_STATUSES.REJECTED,
      },
    }),
  ]);

  return {
    index: clampedIndex,
    total,
    pendingCount: total,
    rejectedCount,
    hasPrevious: clampedIndex > 0,
    hasNext: clampedIndex < total - 1,
    entry: entryRecord ? mapVerifiedLocationRow(entryRecord) : null,
  };
}

export async function updateLocationReviewStatus(locationId, action) {
  const updates =
    action === "accept"
      ? {
          manually_verified: true,
          review_status: REVIEW_STATUSES.ACCEPTED,
        }
      : action === "reject"
        ? {
            manually_verified: false,
            review_status: REVIEW_STATUSES.REJECTED,
          }
        : {
            manually_verified: false,
            review_status: REVIEW_STATUSES.PENDING,
          };

  const updatedRecord = await updateSingleRow(
    VERIFIED_LOCATIONS_TABLE,
    updates,
    {
      filters: { id: locationId },
      columns: VERIFIED_LOCATION_COLUMNS,
    }
  );

  if (!updatedRecord) {
    const error = new Error("Verified location not found.");
    error.statusCode = 404;
    throw error;
  }

  return mapVerifiedLocationRow(updatedRecord);
}

export async function deleteRejectedLocations() {
  const deletedRows = await deleteRows(VERIFIED_LOCATIONS_TABLE, {
    filters: {
      manually_verified: false,
      review_status: REVIEW_STATUSES.REJECTED,
    },
    columns: "id",
  });

  return {
    deletedCount: deletedRows.length,
  };
}
