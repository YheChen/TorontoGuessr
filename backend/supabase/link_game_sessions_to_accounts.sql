-- Attribute games to accounts, and record which scoring curve scored them.
--
-- Both columns are nullable and purely additive, so this migration is safe to
-- apply BEFORE the code that uses it ships. game-store.ts selects an explicit
-- column list rather than `select *`, so a column it does not know about is
-- invisible to it.
--
-- Guests stay first-class. A game played without an account keeps user_id null
-- forever, and the landing page's promise of "No sign-up needed" is untouched.

-- ---------------------------------------------------------------- attribution
--
-- ON DELETE SET NULL, emphatically not CASCADE.
--
-- purge_stale_anonymous_users() deletes rows from auth.users. Under CASCADE that
-- cleanup would delete those players' GAMES too, silently removing finished
-- scores from the leaderboard. Losing the attribution is an acceptable outcome
-- of deleting an account; losing the game is not.
--
-- This is not hypothetical. profiles.last_played_date is only written by the
-- server-side streak sync, which does not exist yet, so it is null for every
-- account today. That means a real player who has finished games still matches
-- the purge's "never played" test. The function below is hardened to close that
-- gap, and SET NULL is the second line of defence if it is ever reopened.
alter table public.game_sessions
  add column if not exists user_id uuid
    references auth.users (id) on delete set null;

-- ------------------------------------------------------------ scoring lineage
--
-- Null means the original curve: linear from 100m to 2km, zero beyond. Rows
-- scored by a later curve carry its version.
--
-- Included now because it is a one-way door. Once a new curve ships there is no
-- way to work out afterwards which curve produced an existing row, so the
-- leaderboard could never separate them or label the seam. Recording it from the
-- first scored game costs one nullable smallint.
alter table public.game_sessions
  add column if not exists scoring_version smallint;

-- Supports a per-account history, newest finished game first.
create index if not exists game_sessions_user_id_idx
  on public.game_sessions (user_id, completed_at desc)
  where user_id is not null;

-- Existing rows are deliberately left unattributed. The only link back to an
-- account would be matching the denormalised username string against
-- profiles.display_name, and that is not sound: leaderboard names are truncated
-- to 10 characters with punctuation stripped, so several display names can
-- collapse onto one. Guessing would attribute a stranger's game to an account.

-- ------------------------------------------------------------- purge hardening
--
-- Same contract as before, with one extra guard: never delete a user who has
-- games attributed to them, whatever the profile columns claim. That makes the
-- function correct even while last_played_date is still unwritten.
--
--   select public.purge_stale_anonymous_users(interval '30 days');
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
      -- Anyone with a game to their name has played, regardless of what the
      -- profile row says.
      and not exists (
        select 1
        from public.game_sessions g
        where g.user_id = u.id
      )
    returning u.id
  )
  select count(*) into deleted_count from stale;

  return deleted_count;
end;
$$;
