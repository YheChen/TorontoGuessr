-- One daily-challenge attempt per player per day, enforced by the database.
--
-- THE HOLE THIS CLOSES. The daily challenge deals the same five locations to
-- everyone for a given date, on purpose: that is what makes scores comparable.
-- Nothing stopped a player starting it again, and every guess response returns
-- that round's actualLocation, because the player has to be shown their result.
-- So the whole attack was: play the daily once, write down five coordinates, start
-- it again, submit them, 25,000, top of the board. No tooling, just a notepad.
-- Verified against production on 2026-08-01: three consecutive daily starts were
-- all accepted and all returned the identical first round.
--
-- WHY A UNIQUE INDEX RATHER THAN A CHECK IN THE BACKEND. A read-then-write check
-- ("has this player played today?") loses a race: two starts fired together both
-- read nothing and both insert. The index cannot be raced, needs no lock the
-- backend has to remember to take, and keeps the guarantee true even for a caller
-- that bypasses the route entirely.
--
-- WHAT THE KEY IS, and what it is not. daily_key is
-- sha256(challenge_date || ':' || identity), where identity is the signed-in
-- user's id when there is one and a random per-browser id otherwise. Two
-- consequences worth being explicit about:
--
--   * Because the DATE is inside the hash, the same player produces a DIFFERENT
--     key every day. It deduplicates within one day and cannot be used to follow
--     anyone across days, which a raw browser id stored in a column would.
--   * For a guest it is only as good as the browser's cooperation: a private
--     window or cleared storage is a new identity. That is a real limit, not an
--     oversight. It stops the accidental and the casual replay, which is nearly
--     all of it, and for signed-in players the user id makes it solid. Closing it
--     completely would mean making the daily board accounts-only.
--
-- SAFE TO RUN TWICE. Both statements are conditional.

alter table public.game_sessions
  add column if not exists daily_key text;

comment on column public.game_sessions.daily_key is
  'sha256(challenge_date || '':'' || account id or browser id) for daily-challenge sessions; null for every other mode. Deduplicates one player''s daily attempts within a day without being correlatable across days.';

-- The enforcement itself.
--
-- PARTIAL, on purpose. Only daily sessions carry a key, so restricting the index
-- to them keeps it off the 3200-plus classic rows and means a null key can never
-- collide with another null. `challenge_date` is included so yesterday's attempt
-- never blocks today's.
create unique index if not exists game_sessions_daily_attempt_idx
  on public.game_sessions (challenge_date, daily_key)
  where mode = 'daily' and daily_key is not null;

-- ------------------------------------------------------------------ backfill
--
-- Nothing to backfill. Existing daily rows keep a null key, which the partial
-- index ignores, so they neither block anyone nor get retroactively deduplicated.
-- There were 4 daily games in the entire history and today's board was empty when
-- this was written, so there is nothing worth reconstructing.
do $$
declare
  v_daily bigint;
  v_keyed bigint;
begin
  select count(*) into v_daily from public.game_sessions where mode = 'daily';
  select count(*) into v_keyed
  from public.game_sessions
  where mode = 'daily' and daily_key is not null;

  raise notice 'daily sessions ........... % (% already keyed)', v_daily, v_keyed;
  raise notice 'unique index ............. game_sessions_daily_attempt_idx';
  raise notice 'existing rows are left with a null key and are ignored by the index';
end;
$$;
