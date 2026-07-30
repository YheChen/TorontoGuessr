-- Shareable challenge links.
--
-- A challenge is a snapshot of the five rounds from one game, addressed by a
-- short code. Anyone opening /game?mode=challenge&c=CODE replays exactly those
-- locations, so scores are comparable.
--
-- The rounds are snapshotted rather than re-derived from a seed on demand: the
-- verified_locations pool changes as rows are added or rejected, so a seed
-- would silently stop reproducing the same five rounds. A snapshot keeps a
-- shared link valid forever.
--
-- rounds holds answer coordinates, so this table must stay service-role only.
-- Row level security is enabled with no policies (matching the other tables),
-- which blocks the anon key entirely.
--
-- The backend detects whether this table exists and reports challenge features
-- as unavailable until the migration is applied, so it can be run at any time.
--
-- APPLY add_game_modes_and_deadlines.sql FIRST (or together with this one).
-- Challenge games are marked by game_sessions.mode = 'challenge', which is how
-- they are kept off the global leaderboard. Without the mode column those games
-- are recorded as classic, so their scores would rank alongside normal games
-- even though a challenge can be replayed until the score is good.

create table if not exists public.challenges (
  code text primary key,
  rounds jsonb not null,
  source_session_id uuid,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.challenges enable row level security;

-- Challenge games are recorded on game_sessions with mode = 'challenge', which
-- the existing (mode, challenge_date, total_score) index already covers. No
-- game_sessions change is needed: mode is a plain text column with no check
-- constraint, so the new value slots in as is.
