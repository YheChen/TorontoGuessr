-- Random round selection, aggregated in SQL.
--
-- The backend previously fetched every verified_locations row on each game
-- start and shuffled in JavaScript. That is O(table) per game and subject to
-- PostgREST's 1,000-row response cap, which silently shrinks the playable
-- pool once the table grows past it. This function samples in the database
-- and returns only the requested number of rows.
--
-- Rows with manually verified panoramas are preferred, rejected locations are
-- excluded, and duplicate panoramas are collapsed. Passing a seed makes the
-- selection deterministic (used for daily-challenge style modes); omitting it
-- gives a fresh random game.
--
-- The backend calls this via PostgREST RPC and falls back to the legacy scan
-- if the function does not exist yet, so this migration can be applied at any
-- time.

create or replace function public.pick_game_rounds(
  round_count integer,
  seed double precision default null
)
returns table (
  id uuid,
  lat double precision,
  lng double precision,
  pano_id text
)
language plpgsql
volatile
as $$
begin
  if seed is not null then
    perform setseed(seed);
  end if;

  return query
  select deduped.id, deduped.lat, deduped.lng, deduped.pano_id
  from (
    select
      v.id,
      v.lat,
      v.lng,
      v.pano_id,
      v.manually_verified,
      row_number() over (
        partition by v.pano_id
        order by v.manually_verified desc, v.created_at asc
      ) as pano_rank
    from public.verified_locations v
    where v.review_status is distinct from 'rejected'
      and v.pano_id is not null
  ) as deduped
  where deduped.pano_rank = 1
  order by deduped.manually_verified desc, random()
  limit round_count;
end;
$$;
