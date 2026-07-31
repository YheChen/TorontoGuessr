-- Per-session play token: proof that you are the player whose game this is.
--
-- THE HOLE THIS CLOSES. Four routes treat a session id as authority, and session
-- ids are PUBLIC: getLeaderboard returns them as entry.id, so anyone can list
-- them. The live consequence is that POST /games/:sessionId/username is
-- unauthenticated, which means anyone can rename any finished leaderboard entry
-- to anything sanitizeUsername allows. Earlier fixes stopped /next and
-- /challenge from handing out answer coordinates, but both treated a symptom.
-- This addresses the cause: a session id identifies a game, it does not
-- authenticate a player.
--
-- HOW IT WORKS. POST /games/start mints an opaque random token, returns it once
-- in that response, and stores only its sha256 here. The four routes then require
-- the token and compare hashes. Only the hash is stored, so a database leak does
-- not hand anyone a working credential. This mirrors lobby_players.player_token_hash,
-- which already does exactly this for multiplayer.
--
-- SAFE TO RUN TWICE. Both statements are conditional on their own effect.

alter table public.game_sessions
  add column if not exists play_token_hash text;

comment on column public.game_sessions.play_token_hash is
  'sha256 (hex) of the play token issued at POST /games/start. Null means no token was ever issued, which the backend grandfathers. Never holds the token itself.';

-- No index. Nothing looks a session up BY this column; it is only ever read from
-- a row already fetched by primary key, so an index would be pure write cost.

-- ------------------------------------------------------------------ backfill
--
-- Every row that already exists has no token, and the backend treats a null hash
-- as grandfathered so that nobody mid-game at deploy time loses their game. That
-- leaves the rename hole open for all 3232 existing rows unless they are closed
-- here.
--
-- The value written is a SENTINEL, not a random secret, and that is deliberate.
-- The check the backend performs is sha256(provided_token) = play_token_hash.
-- A sha256 digest is always 64 hex characters, so a value that is not 64 hex
-- characters cannot be the digest of anything: no token can ever match it, and
-- the row becomes permanently unrenameable. That is the exact property wanted,
-- and it is stronger than random bytes because it does not depend on the quality
-- of a random source. It also reads as what it is when someone looks at the table.
--
-- The two-hour cutoff protects live games. A game is five 60-second rounds, so
-- anything older than two hours is abandoned or finished and cannot be harmed.
-- Rows newer than that keep a null hash, stay grandfathered for the rest of their
-- short life, and are the only rows that remain renameable. There were zero
-- in-progress sessions younger than two hours when this was written.
--
-- Rows created between this migration and the deploy that follows it also get a
-- null hash, and are grandfathered the same way. That ordering is why the
-- backfill is safe to run before the code ships rather than after.
do $$
declare
  v_backfilled bigint;
  v_grandfathered bigint;
begin
  update public.game_sessions
  set play_token_hash = 'legacy-session-no-token-issued'
  where play_token_hash is null
    and created_at < now() - interval '2 hours';

  get diagnostics v_backfilled = row_count;

  select count(*) into v_grandfathered
  from public.game_sessions
  where play_token_hash is null;

  -- A sentinel that could ever be a sha256 digest would silently leave every
  -- backfilled row renameable by anyone who found the matching token. Assert the
  -- property the paragraph above claims, rather than trusting the claim.
  if 'legacy-session-no-token-issued' ~ '^[0-9a-f]{64}$' then
    raise exception
      'ROLLED BACK: the backfill sentinel is shaped like a sha256 digest, so it is forgeable.';
  end if;

  raise notice 'sessions closed to renaming ... %', v_backfilled;
  raise notice 'sessions left grandfathered .. % (started within the last 2 hours)', v_grandfathered;
end;
$$;
