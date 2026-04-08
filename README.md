# TorontoGuessr

TorontoGuessr is a Toronto-only Street View guessing game with a Next.js frontend, a small Node backend, and Supabase for persistence.

## Stack

- `frontend/`: Next.js 15 app
- `backend/`: Node API used locally and in Vercel Functions
- Supabase: verified location cache, game sessions, leaderboard data
- Google Maps / Street View: map UI and panorama rendering

## Repo Layout

```text
.
├── frontend/
├── backend/
├── scripts/
└── package.json
```

## Requirements

- Node.js 20+
- npm 10+
- A Supabase project
- A Google Maps API key with the APIs your app uses enabled

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the env examples:

   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

3. Create a Supabase project.

4. In the Supabase SQL editor, run [backend/supabase/schema.sql](backend/supabase/schema.sql).

5. Fill in [backend/.env.example](backend/.env.example) values in `backend/.env`:

   ```env
   PORT=3001
   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   LOCATION_GENERATION_ENABLED=false
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
   ```

6. Fill in [frontend/.env.example](frontend/.env.example) values in `frontend/.env`:

   ```env
   NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
   ```

7. Start the app:

   ```bash
   npm run dev
   ```

Frontend runs on `http://localhost:3000` and the backend runs on `http://localhost:3001`.

## Supabase Setup

For normal app usage, the backend needs:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

You can find both in the Supabase dashboard:

- `SUPABASE_URL`: project dashboard -> `Connect` -> `Project URL`
- `SUPABASE_SERVICE_ROLE_KEY`: `Settings` -> `API Keys` -> `service_role`

Use the project URL itself, for example:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
```

Do not use `NEXT_PUBLIC_SUPABASE_*` variables here. This app talks to Supabase from the backend, not from the browser.

## Data Model

The Supabase schema creates two tables:

- `verified_locations`: cached Toronto Street View locations with `lat`, `lng`, and `pano_id`
- `game_sessions`: persisted game state and finished sessions

The leaderboard is derived from finished `game_sessions` rows. The current API returns the top `10` entries.

## Verified Location Migration

If you already migrated verified locations into Supabase, you can skip this section.

The one-time migration script is [backend/scripts/migrate-verified-locations-from-firestore.mjs](backend/scripts/migrate-verified-locations-from-firestore.mjs).

What it does:

- reads Firestore `verifiedLocations`
- validates existing coordinates against Google Street View when needed
- inserts verified rows into Supabase `verified_locations`
- does not generate new random coordinates

To run it:

1. Temporarily install Firebase in the backend workspace:

   ```bash
   npm install --prefix backend --no-save firebase
   ```

2. Add the Firebase env vars shown in [backend/.env.example](backend/.env.example) to `backend/.env`.

3. Run the migration:

   ```bash
   npm run migrate:verified-locations --workspace backend
   ```

4. After Supabase is seeded, keep this in `backend/.env`:

   ```env
   LOCATION_GENERATION_ENABLED=false
   ```

With generation disabled, the backend will not create new random Toronto coordinates.

## Scripts

From the repo root:

- `npm run dev`: start frontend and backend together
- `npm run build`: build-check backend and frontend
- `npm run start`: start frontend and backend in production mode

Workspace-specific:

- `npm run dev --workspace frontend`
- `npm run dev --workspace backend`
- `npm run migrate:verified-locations --workspace backend`

## API

Main backend routes:

- `GET /api/health`
- `POST /api/games/start`
- `POST /api/games/:sessionId/guess`
- `POST /api/games/:sessionId/next`
- `GET /api/leaderboard`

## Deploying To Vercel

This repo is easiest to deploy as two Vercel projects.

### 1. Backend project

- Import the same Git repo into Vercel
- Set the root directory to `backend`
- Framework preset: `Other`
- Build command: `npm run build`

Backend env vars:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
LOCATION_GENERATION_ENABLED=false
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
```

Notes:

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` on the backend is only needed if the backend still needs Street View metadata lookups.
- If your Supabase `verified_locations` table is already fully seeded with `pano_id` values and generation is disabled, the backend can usually run without that key.

### 2. Frontend project

- Import the same Git repo again
- Set the root directory to `frontend`
- Framework preset: `Next.js`

Frontend env vars:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-backend-project.vercel.app/api
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
```

Deploy order:

1. Deploy the backend project first
2. Copy its production URL
3. Set `NEXT_PUBLIC_API_BASE_URL` in the frontend project
4. Deploy the frontend project

## Notes

- Firebase is no longer used for normal app runtime.
- Old Firestore credentials are only needed for the one-time migration script.
- The frontend still needs a Google Maps API key even after the Supabase migration, because the game UI still uses Google Maps and Street View.
