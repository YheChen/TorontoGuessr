-- Optional player accounts.
--
-- Supabase Auth is the identity provider ONLY. auth.users answers "who is this"
-- and this table holds the app's own profile data. The backend remains the sole
-- reader and writer of application data using the service-role key, which is
-- what keeps the anti-cheat model intact: lobbies.rounds and challenges.rounds
-- hold answer coordinates and must never be readable by a browser.
--
-- Accounts are strictly optional. The landing page promises "No sign-up
-- needed", so nothing here may become a requirement to play. The intended flow
-- is an anonymous Supabase user created after a game finishes, which can later
-- link a real credential and keep the same user id, so progress carries over
-- with no data migration.
--
-- This migration deliberately does NOT touch game_sessions. Attributing games
-- to users comes later; adding a column now would introduce a third schema tier
-- to the existing legacy/extended fallback in game-store.ts for no present gain.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Case is preserved for display; uniqueness is enforced case-insensitively by
  -- the index below. Null until the player chooses one.
  display_name text,
  -- Mirrors auth.users.is_anonymous so the backend can tell an upgraded account
  -- from a throwaway one without a second lookup.
  is_anonymous boolean not null default true,
  current_streak integer not null default 0,
  best_streak integer not null default 0,
  last_played_date date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Two players must not differ only by capitalisation.
create unique index if not exists profiles_display_name_key
  on public.profiles (lower(display_name))
  where display_name is not null;

-- Supports the cleanup of anonymous accounts that never went anywhere.
create index if not exists profiles_anonymous_idx
  on public.profiles (created_at)
  where is_anonymous and last_played_date is null;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- Same posture as every other table: RLS on with no policies, so only the
-- service-role key can read or write. Anonymous sign-ins use the
-- `authenticated` role, and with no policies that role is denied too.
alter table public.profiles enable row level security;

-- Cleanup for anonymous accounts that never played and were never upgraded.
-- Deleting from auth.users cascades to profiles. Run it on a schedule (Supabase
-- pg_cron is the least infrastructure) or call it manually:
--
--   select public.purge_stale_anonymous_users(interval '30 days');
--
-- Only ever removes users that are still anonymous AND never recorded a play,
-- so an upgraded account or an active streak is never touched.
create or replace function public.purge_stale_anonymous_users(
  older_than interval default interval '30 days'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  with stale as (
    delete from auth.users u
    using public.profiles p
    where p.user_id = u.id
      and u.is_anonymous
      and p.is_anonymous
      and p.last_played_date is null
      and p.display_name is null
      and u.created_at < timezone('utc', now()) - older_than
    returning u.id
  )
  select count(*) into deleted_count from stale;

  return deleted_count;
end;
$$;
