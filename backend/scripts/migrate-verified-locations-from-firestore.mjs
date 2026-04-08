import { loadEnv } from "../src/env.mjs";
import { insertRows, selectSingleRow } from "../src/supabase.mjs";
import { getValidatedPanorama } from "../src/services/streetview-service.mjs";

loadEnv();

const FIRESTORE_COLLECTION = "verifiedLocations";
const SUPABASE_TABLE = "verified_locations";
const SUPABASE_RETURN_COLUMNS = "id";
const INSERT_BATCH_SIZE = 500;
const PROGRESS_INTERVAL = 25;

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function getFirebaseConfig() {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const missingKeys = Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    throw new Error(
      `Missing Firebase config for migration: ${missingKeys.join(", ")}`
    );
  }

  return firebaseConfig;
}

async function loadFirestoreSdk() {
  try {
    const [appModule, firestoreModule] = await Promise.all([
      import("firebase/app"),
      import("firebase/firestore"),
    ]);

    return {
      ...appModule,
      ...firestoreModule,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown import failure.";
    throw new Error(
      `Firebase SDK is not installed for the one-time migration. Run "npm install --prefix backend --no-save firebase" first. Original error: ${message}`
    );
  }
}

function normalizeSourceLocations(snapshotDocs) {
  const normalizedRows = [];
  let skippedMissingCoordinates = 0;
  let skippedUnvalidatedPanorama = 0;
  let skippedDuplicatePanoramas = 0;
  let firestoreBackfillWrites = 0;
  let firestoreBackfillWriteFailures = 0;
  let existingPanoramas = 0;
  let validatedPanoramas = 0;

  return {
    normalizedRows,
    skippedMissingCoordinates,
    skippedUnvalidatedPanorama,
    skippedDuplicatePanoramas,
    firestoreBackfillWrites,
    firestoreBackfillWriteFailures,
    existingPanoramas,
    validatedPanoramas,
  };
}

async function buildImportRows(snapshotDocs, updateDoc) {
  const summary = normalizeSourceLocations(snapshotDocs);
  const seenPanoramas = new Set();
  let firestoreWritesEnabled = true;

  for (let index = 0; index < snapshotDocs.length; index += 1) {
    const document = snapshotDocs[index];
    const data = document.data();
    let lat = data?.lat;
    let lng = data?.lng;
    let panoId =
      typeof data?.panoId === "string"
        ? data.panoId.trim()
        : typeof data?.pano_id === "string"
          ? data.pano_id.trim()
          : "";

    if (typeof lat !== "number" || typeof lng !== "number") {
      summary.skippedMissingCoordinates += 1;
      continue;
    }

    if (panoId) {
      summary.existingPanoramas += 1;
    } else {
      const validated = await getValidatedPanorama({ lat, lng });
      if (!validated) {
        summary.skippedUnvalidatedPanorama += 1;
        continue;
      }

      lat = validated.lat;
      lng = validated.lng;
      panoId = validated.panoId;
      summary.validatedPanoramas += 1;

      if (firestoreWritesEnabled) {
        try {
          await updateDoc(document.ref, {
            lat,
            lng,
            panoId,
          });
          summary.firestoreBackfillWrites += 1;
        } catch (error) {
          summary.firestoreBackfillWriteFailures += 1;
          firestoreWritesEnabled = false;
          const message =
            error instanceof Error ? error.message : "Unexpected Firestore write failure.";
          console.warn(
            `[migrate:verified-locations] Firestore backfill writes disabled for the rest of this run: ${message}`
          );
        }
      }
    }

    if (seenPanoramas.has(panoId)) {
      summary.skippedDuplicatePanoramas += 1;
      continue;
    }

    seenPanoramas.add(panoId);
    summary.normalizedRows.push({
      lat,
      lng,
      pano_id: panoId,
    });

    if ((index + 1) % PROGRESS_INTERVAL === 0 || index === snapshotDocs.length - 1) {
      console.log(
        `Processed ${index + 1}/${snapshotDocs.length} Firestore documents...`
      );
    }
  }

  return summary;
}

function summarizeSampleDocuments(snapshotDocs, limit = 3) {
  return snapshotDocs.slice(0, limit).map((document) => {
    const data = document.data();

    return {
      id: document.id,
      keys: Object.keys(data).sort(),
      latType: typeof data?.lat,
      lngType: typeof data?.lng,
      panoIdType: typeof data?.panoId,
      pano_idType: typeof data?.pano_id,
    };
  });
}

async function main() {
  const existingSupabaseRow = await selectSingleRow(SUPABASE_TABLE, {
    columns: "id",
  });

  if (existingSupabaseRow) {
    throw new Error(
      `Supabase table "${SUPABASE_TABLE}" already has data. Empty it first to avoid duplicate imports.`
    );
  }

  const {
    getApp,
    getApps,
    initializeApp,
    getFirestore,
    collection,
    getDocs,
    updateDoc,
  } = await loadFirestoreSdk();

  const app = getApps().length
    ? getApp()
    : initializeApp(getFirebaseConfig());
  const db = getFirestore(app);
  const snapshot = await getDocs(collection(db, FIRESTORE_COLLECTION));
  const {
    normalizedRows,
    skippedMissingCoordinates,
    skippedUnvalidatedPanorama,
    skippedDuplicatePanoramas,
    firestoreBackfillWrites,
    firestoreBackfillWriteFailures,
    existingPanoramas,
    validatedPanoramas,
  } = await buildImportRows(snapshot.docs, updateDoc);

  console.log(`Firestore documents read: ${snapshot.docs.length}`);
  console.log(`Importable rows found: ${normalizedRows.length}`);
  console.log(`Existing panoIds reused: ${existingPanoramas}`);
  console.log(`Missing panoIds validated via Google: ${validatedPanoramas}`);
  console.log(`Firestore panoId backfill writes: ${firestoreBackfillWrites}`);
  console.log(
    `Firestore panoId backfill write failures: ${firestoreBackfillWriteFailures}`
  );
  console.log(`Skipped missing coordinates: ${skippedMissingCoordinates}`);
  console.log(`Skipped without valid Street View panorama: ${skippedUnvalidatedPanorama}`);
  console.log(`Skipped duplicate panoId: ${skippedDuplicatePanoramas}`);

  if (normalizedRows.length === 0) {
    if (snapshot.docs.length > 0) {
      console.log(
        "Sample Firestore document shapes:",
        JSON.stringify(summarizeSampleDocuments(snapshot.docs), null, 2)
      );
    }

    throw new Error(
      `No importable rows found in Firestore collection "${FIRESTORE_COLLECTION}".`
    );
  }

  let insertedRowCount = 0;

  for (const batch of chunk(normalizedRows, INSERT_BATCH_SIZE)) {
    const insertedRows = await insertRows(SUPABASE_TABLE, batch, {
      columns: SUPABASE_RETURN_COLUMNS,
    });

    insertedRowCount += insertedRows.length;
  }

  console.log(`Supabase rows inserted: ${insertedRowCount}`);

  if (insertedRowCount < 5) {
    console.warn(
      "Warning: fewer than 5 verified locations were imported. With LOCATION_GENERATION_ENABLED=false, a new game will not be able to start."
    );
  }

  console.log(
    'Set LOCATION_GENERATION_ENABLED=false to prevent fallback generation after migration.'
  );
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : "Unexpected migration failure.";
  console.error(message);
  process.exitCode = 1;
});
