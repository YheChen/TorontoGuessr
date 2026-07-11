import { z } from "zod";
import {
  callRpc,
  countRows,
  deleteRows,
  insertRow,
  selectRows,
  selectSingleRow,
  updateSingleRow,
} from "../supabase.js";
import { getValidatedPanorama } from "./streetview-service.js";
import { createHttpError } from "../http-utils.js";
import {
  REVIEW_STATUSES,
  type GameRound,
  type LatLng,
  type ReviewAction,
  type VerifiedLocation,
  type VerifiedLocationRow,
} from "../types.js";

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

interface PlayableLocation {
  lat: number;
  lng: number;
  panoId: string;
}

function generateRandomLocation(): LatLng {
  const lat =
    Math.random() * (TORONTO_BOUNDS.north - TORONTO_BOUNDS.south) +
    TORONTO_BOUNDS.south;
  const lng =
    Math.random() * (TORONTO_BOUNDS.east - TORONTO_BOUNDS.west) +
    TORONTO_BOUNDS.west;

  return { lat, lng };
}

/** Deterministic PRNG for seeded shuffles (mulberry32). */
function mulberry32(seedInt: number): () => number {
  let state = seedInt >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = a;
  }
  return shuffled;
}

function toRound(location: PlayableLocation): GameRound {
  return {
    lat: location.lat,
    lng: location.lng,
    panoId: location.panoId,
    heading: Math.floor(Math.random() * 360),
    pitch: 0,
    zoom: 1,
  };
}

function mapVerifiedLocationRow(row: VerifiedLocationRow): VerifiedLocation {
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

function disableLocationWrites(error: unknown): void {
  locationWritesEnabled = false;

  if (hasWarnedAboutWriteFailures) {
    return;
  }

  hasWarnedAboutWriteFailures = true;
  const message =
    error instanceof Error ? error.message : "Unexpected write failure.";

  console.warn(
    `[location-service] Supabase writes disabled for this process: ${message}`
  );
}

async function normalizeStoredLocation(
  candidate: VerifiedLocation
): Promise<PlayableLocation | null> {
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
      await updateSingleRow<VerifiedLocationRow>(
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

async function createVerifiedLocation(): Promise<PlayableLocation> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = generateRandomLocation();
    const validated = await getValidatedPanorama(candidate);

    if (!validated) {
      continue;
    }

    if (locationWritesEnabled) {
      try {
        await insertRow<VerifiedLocationRow>(
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

/** Row shape returned by the pick_game_rounds Postgres function. */
const pickedRoundRowSchema = z.object({
  id: z.string().uuid(),
  lat: z.number(),
  lng: z.number(),
  pano_id: z.string().min(1),
});

let roundsRpcAvailable = true;

/**
 * Select rounds for a new game. Prefers the pick_game_rounds SQL function
 * (exact sampling regardless of table size, one round trip); falls back to
 * the legacy full-table scan until the migration is applied. An optional
 * seed makes the SQL selection deterministic.
 */
export async function selectGameRounds(
  count = 5,
  seed: number | null = null
): Promise<GameRound[]> {
  if (roundsRpcAvailable) {
    try {
      const payload = await callRpc<unknown>("pick_game_rounds", {
        round_count: count,
        seed,
      });
      const rows = z.array(pickedRoundRowSchema).parse(payload);

      if (rows.length >= count) {
        return rows.slice(0, count).map((row) =>
          toRound({ lat: row.lat, lng: row.lng, panoId: row.pano_id })
        );
      }
      // Pool smaller than requested: the scan path knows how to validate
      // pano-less rows and to generate new locations when enabled.
    } catch (error) {
      roundsRpcAvailable = false;
      const message =
        error instanceof Error ? error.message : "Unknown RPC failure.";
      console.warn(
        `[location-service] pick_game_rounds RPC unavailable, using full-scan fallback (capped at 1000 rows): ${message}`
      );
    }
  }

  return selectGameRoundsFromScan(count, seed);
}

/**
 * Legacy fallback: fetch the whole table and shuffle in JS. Subject to
 * PostgREST's 1,000-row response cap. Used until the pick_game_rounds
 * migration is applied, and when the cached pool is smaller than a game.
 * A seed keeps the shuffle deterministic (daily challenge parity).
 */
async function selectGameRoundsFromScan(
  count: number,
  seed: number | null = null
): Promise<GameRound[]> {
  const rng =
    seed === null
      ? Math.random
      : mulberry32(Math.floor((seed + 1) * 2147483647));
  const allCachedLocations = (
    await selectRows<VerifiedLocationRow>(VERIFIED_LOCATIONS_TABLE, {
      columns: VERIFIED_LOCATION_COLUMNS,
      // Stable base order so seeded shuffles are reproducible.
      order: "created_at.asc",
    })
  ).map(mapVerifiedLocationRow);
  const cachedLocations = [
    ...shuffle(
      allCachedLocations.filter(
        (row) =>
          row.manuallyVerified && row.reviewStatus !== REVIEW_STATUSES.REJECTED
      ),
      rng
    ),
    ...shuffle(
      allCachedLocations.filter(
        (row) =>
          !row.manuallyVerified && row.reviewStatus !== REVIEW_STATUSES.REJECTED
      ),
      rng
    ),
  ];

  const rounds: GameRound[] = [];
  const seenPanoramas = new Set<string>();

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

interface ReviewQueueQuery {
  index?: number;
  locationId?: string | null;
}

export async function getLocationReviewQueue({
  index = 0,
  locationId = null,
}: ReviewQueueQuery = {}) {
  const pendingFilters = {
    manually_verified: false,
    review_status: REVIEW_STATUSES.PENDING,
  };
  const [total, rejectedCount, pendingRows] = await Promise.all([
    countRows(VERIFIED_LOCATIONS_TABLE, {
      filters: pendingFilters,
    }),
    countRows(VERIFIED_LOCATIONS_TABLE, {
      filters: {
        manually_verified: false,
        review_status: REVIEW_STATUSES.REJECTED,
      },
    }),
    locationId
      ? selectRows<Pick<VerifiedLocationRow, "id">>(VERIFIED_LOCATIONS_TABLE, {
          columns: "id",
          filters: pendingFilters,
          order: "created_at.asc",
        })
      : Promise.resolve<Array<Pick<VerifiedLocationRow, "id">>>([]),
  ]);

  const resolvedIndex =
    locationId && pendingRows.length > 0
      ? pendingRows.findIndex((row) => row.id === locationId)
      : -1;
  const requestedIndex = resolvedIndex >= 0 ? resolvedIndex : index;
  const clampedIndex = total === 0 ? 0 : Math.min(requestedIndex, total - 1);
  const entryRecord =
    total === 0
      ? null
      : await selectSingleRow<VerifiedLocationRow>(VERIFIED_LOCATIONS_TABLE, {
          columns: VERIFIED_LOCATION_COLUMNS,
          filters: pendingFilters,
          order: "created_at.asc",
          offset: clampedIndex,
        });

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

export async function updateLocationReviewStatus(
  locationId: string,
  action: ReviewAction
): Promise<VerifiedLocation> {
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

  const updatedRecord = await updateSingleRow<VerifiedLocationRow>(
    VERIFIED_LOCATIONS_TABLE,
    updates,
    {
      filters: { id: locationId },
      columns: VERIFIED_LOCATION_COLUMNS,
    }
  );

  if (!updatedRecord) {
    throw createHttpError(404, "Verified location not found.");
  }

  return mapVerifiedLocationRow(updatedRecord);
}

export async function deleteRejectedLocations() {
  const deletedRows = await deleteRows<Pick<VerifiedLocationRow, "id">>(
    VERIFIED_LOCATIONS_TABLE,
    {
      filters: {
        manually_verified: false,
        review_status: REVIEW_STATUSES.REJECTED,
      },
      columns: "id",
    }
  );

  return {
    deletedCount: deletedRows.length,
  };
}
