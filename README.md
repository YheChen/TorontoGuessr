# TorontoGuessr

TorontoGuessr is a Toronto-only Street View guessing game with a Next.js frontend, a small Node backend, and Supabase for persistence.

Players get five Toronto Street View rounds, place guesses on a map, and earn points based on geographic accuracy. The app also includes leaderboards, daily gameplay stats, SEO metadata routes, and an admin review tool for manually approving or rejecting cached Street View locations.

## Stack

- `frontend/`: Next.js 15 App Router app
- `backend/`: small Node API used locally and in Vercel Functions
- Supabase: verified location cache, game sessions, leaderboard data
- Google Maps / Street View: gameplay map, Street View rendering, review tooling

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

4. For a fresh database, run [backend/supabase/schema.sql](backend/supabase/schema.sql) in the Supabase SQL editor.

   If you already had an older TorontoGuessr schema, also run [backend/supabase/add_verified_location_review_columns.sql](backend/supabase/add_verified_location_review_columns.sql) to add the manual review fields.

5. Fill in `backend/.env` using [backend/.env.example](backend/.env.example):

   ```env
   PORT=3001
   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   LOCATION_GENERATION_ENABLED=false
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
   ADMIN_REVIEW_TOKEN=your-long-random-admin-token
   ```

6. Fill in `frontend/.env` using [frontend/.env.example](frontend/.env.example):

   ```env
   NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api
   SITE_URL=http://localhost:3000
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

The Supabase schema creates two main tables:

- `verified_locations`: cached Toronto Street View locations with `lat`, `lng`, `pano_id`, `manually_verified`, and `review_status`
- `game_sessions`: persisted game state, results, and finished sessions used for leaderboards and stats

Notes:

- `manually_verified = true` means a location was explicitly approved in the admin review tool.
- `review_status` is one of `pending`, `accepted`, or `rejected`.
- Gameplay prefers manually verified locations first and excludes rejected ones.
- Leaderboards are derived from finished `game_sessions` rows.

## Gameplay And Leaderboards

Main gameplay behavior:

- each game starts a five-round session
- rounds are selected from cached verified locations in Supabase
- if generation is enabled and the cache is too small, the backend can generate more verified Toronto locations using Street View metadata
- scores are based on guess distance from the true location

Leaderboard behavior:

- `lifetime`, `daily`, `weekly`, and `monthly` periods are supported
- the frontend shows a top-5 preview first
- `lifetime` expands to a top-25 view
- `daily`, `weekly`, and `monthly` keep pagination after the preview

## Verified Location Review Workflow

The admin review page lives at `/admin/review-locations`.

It is designed to manually filter out bad Street View cache entries, especially indoor or unusable panoramas. The review UI includes:

- Street View panorama preview
- 2D map preview with a marker on the saved coordinates
- `Accept`, `Reject`, `Previous`, `Next`, and `Undo Last Action`

Review behavior:

- `Accept`: sets `manually_verified = true` and `review_status = accepted`
- `Reject`: sets `review_status = rejected` and removes the row from the active review queue
- `Undo Last Action`: restores the most recently accepted or rejected row to `pending` and returns the queue to that specific location

Admin access is protected by `ADMIN_REVIEW_TOKEN`, which must be sent to the backend through the review UI.

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

With generation disabled, the backend will not create new random Toronto coordinates at runtime.

## Verified Location Generation

There are now two ways verified locations can be added:

1. Runtime generation during gameplay if `LOCATION_GENERATION_ENABLED=true`
2. Manual bulk generation with [backend/scripts/generate-verified-locations.mjs](backend/scripts/generate-verified-locations.mjs)

To generate `100` more verified locations:

```bash
npm run generate:verified-locations --workspace backend
```

To generate a custom number:

```bash
npm run generate:verified-locations --workspace backend -- 25
```

The script validates Street View coverage, skips duplicate panoramas already stored in Supabase, and inserts only newly verified rows.

## Stats And SEO

The backend exposes a gameplay stats endpoint at `GET /api/stats/games`.

It returns:

- total games started
- total games finished
- a daily time-series for the requested range

Query parameters:

- `days`: optional, `1-365`, defaults to `30`
- `timeZone`: optional, defaults to `America/Toronto`

The frontend also includes Next.js metadata routes for:

- `robots.txt`
- `sitemap.xml`

These use `SITE_URL` when available. The `/game` route is excluded from crawling because it auto-starts a game session.

## Scripts

From the repo root:

- `npm run dev`: start frontend and backend together
- `npm run build`: build-check backend and frontend
- `npm run start`: start frontend and backend in production mode

Workspace-specific:

- `npm run dev --workspace frontend`
- `npm run dev --workspace backend`
- `npm run generate:verified-locations --workspace backend`
- `npm run migrate:verified-locations --workspace backend`

## API

Main backend routes:

- `GET /api/health`
- `POST /api/games/start`
- `POST /api/games/:sessionId/guess`
- `POST /api/games/:sessionId/next`
- `POST /api/games/:sessionId/username`
- `GET /api/leaderboard?period=lifetime|daily|weekly|monthly&page=1&limit=10`
- `GET /api/stats/games?days=30&timeZone=America/Toronto`
- `GET /api/admin/review-locations?index=0`
- `GET /api/admin/review-locations?locationId=<uuid>`
- `PATCH /api/admin/review-locations/:locationId` with `{ "action": "accept" | "reject" | "undo" }`

## Deploying To Vercel

This repo is easiest to deploy as two Vercel projects.

### 1. Backend project

- import the same Git repo into Vercel
- set the root directory to `backend`
- framework preset: `Other`
- build command: `npm run build`

Backend env vars:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
LOCATION_GENERATION_ENABLED=false
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
ADMIN_REVIEW_TOKEN=your-long-random-admin-token
```

Notes:

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` on the backend is only needed if the backend still performs Street View metadata lookups for migration, generation, or pano backfill.
- If `verified_locations` is already fully seeded with `pano_id` values and generation is disabled, the backend can usually run without that key.

### 2. Frontend project

- import the same Git repo again
- set the root directory to `frontend`
- framework preset: `Next.js`

Frontend env vars:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-backend-project.vercel.app/api
SITE_URL=https://www.torontoguessr.ca
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
```

Deploy order:

1. deploy the backend project first
2. copy its production URL
3. set `NEXT_PUBLIC_API_BASE_URL` in the frontend project
4. deploy the frontend project

## Google Maps Key Notes

The frontend Google Maps JavaScript key should allow the domains you actually use, for example:

- `https://www.torontoguessr.ca/*`
- `https://torontoguessr.ca/*`
- `http://localhost:3000/*`

If you use preview deployments, also add the preview domain pattern.

Right now the repo can use the same Google key on both frontend and backend, but a cleaner long-term setup is:

- browser key for frontend Maps / Street View UI, restricted by HTTP referrer
- server key for backend Street View metadata requests

## Notes

- Firebase is no longer used for normal runtime.
- Old Firestore credentials are only needed for the one-time migration script.
- The frontend still needs a Google Maps API key even after the Supabase migration because gameplay and review tooling both use Google Maps and Street View.
