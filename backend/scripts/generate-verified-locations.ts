import { loadEnv } from "../src/env.js";
import { countRows, insertRow, selectRows } from "../src/supabase.js";
import { getValidatedPanorama } from "../src/services/streetview-service.js";
import type { LatLng, VerifiedLocationRow } from "../src/types.js";

loadEnv();

const VERIFIED_LOCATIONS_TABLE = "verified_locations";
const DEFAULT_GENERATE_COUNT = 100;
const PROGRESS_INTERVAL = 10;
const MAX_ATTEMPTS_MULTIPLIER = 100;

// Default: the downtown core the game has always used. Pass --bounds=city to
// sample the full City of Toronto (Etobicoke to Scarborough); new locations
// still land in the admin review queue before they can appear in games.
const DOWNTOWN_BOUNDS = {
  north: 43.679751,
  south: 43.636327,
  west: -79.413625,
  east: -79.350063,
};
const CITY_BOUNDS = {
  north: 43.8555,
  south: 43.581,
  west: -79.6393,
  east: -79.1152,
};

const useCityBounds = process.argv.includes("--bounds=city");
const TORONTO_BOUNDS = useCityBounds ? CITY_BOUNDS : DOWNTOWN_BOUNDS;

function parseRequestedCount(): number {
  const positional = process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"));
  const rawCount = positional[0] ?? String(DEFAULT_GENERATE_COUNT);
  const count = Number.parseInt(rawCount, 10);

  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(
      `Invalid location count "${rawCount}". Provide a positive integer.`
    );
  }

  return count;
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

async function loadExistingPanoramas(): Promise<Set<string>> {
  const rows = await selectRows<Pick<VerifiedLocationRow, "pano_id">>(
    VERIFIED_LOCATIONS_TABLE,
    {
      columns: "pano_id",
    }
  );

  const panoramas = new Set<string>();
  for (const row of rows) {
    const panoId = typeof row.pano_id === "string" ? row.pano_id.trim() : "";
    if (panoId) {
      panoramas.add(panoId);
    }
  }

  return panoramas;
}

async function main(): Promise<void> {
  const requestedCount = parseRequestedCount();
  const existingPanoramas = await loadExistingPanoramas();
  const beforeCount = await countRows(VERIFIED_LOCATIONS_TABLE);
  const maxAttempts = Math.max(
    requestedCount * MAX_ATTEMPTS_MULTIPLIER,
    requestedCount + 25
  );

  let insertedCount = 0;
  let attempts = 0;
  let duplicatePanoramas = 0;
  let invalidCandidates = 0;

  while (insertedCount < requestedCount) {
    if (attempts >= maxAttempts) {
      throw new Error(
        `Stopped after ${attempts} attempts. Inserted ${insertedCount}/${requestedCount} new locations.`
      );
    }

    attempts += 1;

    const candidate = generateRandomLocation();
    const validated = await getValidatedPanorama(candidate);

    if (!validated) {
      invalidCandidates += 1;
      continue;
    }

    if (existingPanoramas.has(validated.panoId)) {
      duplicatePanoramas += 1;
      continue;
    }

    await insertRow<Pick<VerifiedLocationRow, "id" | "pano_id">>(
      VERIFIED_LOCATIONS_TABLE,
      {
        lat: validated.lat,
        lng: validated.lng,
        pano_id: validated.panoId,
      },
      {
        columns: "id,pano_id",
      }
    );

    existingPanoramas.add(validated.panoId);
    insertedCount += 1;

    if (
      insertedCount % PROGRESS_INTERVAL === 0 ||
      insertedCount === requestedCount
    ) {
      console.log(
        `Inserted ${insertedCount}/${requestedCount} new verified locations...`
      );
    }
  }

  const afterCount = await countRows(VERIFIED_LOCATIONS_TABLE);

  console.log(`Verified locations before: ${beforeCount}`);
  console.log(`Verified locations after: ${afterCount}`);
  console.log(`New locations inserted: ${insertedCount}`);
  console.log(`Generation attempts: ${attempts}`);
  console.log(`Skipped duplicate panoramas: ${duplicatePanoramas}`);
  console.log(`Skipped invalid Street View candidates: ${invalidCandidates}`);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unexpected generation failure.";
  console.error(message);
  process.exitCode = 1;
});
