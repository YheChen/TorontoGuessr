-- Rescore every historical round with the city-scale curve.
--
-- The old curve was linear from 100 m to 2 km and zero beyond, which scored a
-- correct-neighbourhood guess identically to a guess on another continent. The
-- new curve (backend/src/scoring-service.ts) is 5000 / (1 + (d - 0.1)^2). This
-- brings existing rows onto it so the all-time leaderboard stops comparing two
-- different games.
--
-- Rescoring is lossless because every round result already stores its own
-- `distance`. Nothing is estimated or reconstructed: the score is recomputed
-- from the number that was recorded at the time.
--
-- SAFE TO RUN TWICE. The recomputation reads only `distance`, which never
-- changes, so a second run is a no-op and reports 0 rows updated.
--
-- SELF-ROLLING-BACK. The reference-vector check runs before any write. The
-- integrity check runs inside the same DO block as the UPDATE, and a DO block is
-- a single statement, so raising there undoes the update rather than leaving the
-- table half-converted.
--
-- EXPECTED RESULT, measured independently in JS against the live data on
-- 2026-07-30 before this was written. If the notices below disagree with these,
-- stop and investigate rather than assuming the SQL is right:
--
--   sessions updated ............ 2280   (of 3220; 940 were already correct)
--   aggregate total_score ....... 24,452,479 -> 26,701,433  (1.09x)
--   round results rescored ...... 9417, of which 703 have distance null
--   sessions that cannot be rescored ... 0
--
-- Not included: lobby_players.results also stores per-round scores, but lobbies
-- are ephemeral and excluded from the leaderboard, so rescoring them buys
-- nothing.

-- ---------------------------------------------------------------- the curve
--
-- Defined standalone and idempotently so this migration does not depend on
-- add_submit_guess_function.sql having been applied (it has not been). That file
-- creates the same function with the same body; `create or replace` means
-- whichever runs last leaves the identical definition.
--
-- round() on ::numeric, NOT on double precision. Postgres rounds float8 via
-- rint() (banker's rounding, round(0.5::float8) = 0) while JS Math.round is
-- half-up. Casting to numeric gives half-away-from-zero, which matches JS for
-- the non-negative values here. There are raw values within 1e-6 of a .5
-- boundary, so this is a real difference and not a theoretical one.
create or replace function public.score_for_distance_km(
  p_distance_km double precision
)
returns integer
language sql
immutable
parallel safe
as $$
  select case
    -- Fail closed, exactly as the TypeScript does. A null or negative distance
    -- must never fall through to the plateau branch and pay a perfect round.
    -- Null is the common case here: a timeout or a late guess stores no distance.
    when p_distance_km is null then 0
    when p_distance_km <> p_distance_km then 0            -- NaN
    when p_distance_km < 0 then 0
    when p_distance_km = 'Infinity'::double precision then 0
    when p_distance_km <= 0.1 then 5000
    else round(
      (
        5000.0::double precision
        / (1 + (p_distance_km - 0.1) * (p_distance_km - 0.1))
      )::numeric
    )::integer
  end;
$$;

-- ------------------------------------------------- check the curve BEFORE writing
--
-- Same reference vectors as backend/tests/scoring-service.test.ts. If the curve
-- in this file has drifted from the application's, this aborts before a single
-- row is touched. Rescoring 3220 sessions with a wrong curve would be far harder
-- to undo than to prevent.
do $$
declare
  v_expected constant jsonb := jsonb_build_object(
    '0', 5000, '0.05', 5000, '0.1', 5000, '0.25', 4890, '0.5', 4310,
    '1', 2762, '1.1', 2500, '2', 1085, '2.1', 1000, '3', 531,
    '5', 200, '10', 50, '20', 13, '40', 3, '200', 0
  );
  v_key text;
  v_want integer;
  v_got integer;
begin
  for v_key, v_want in select key, value::integer from jsonb_each_text(v_expected)
  loop
    v_got := public.score_for_distance_km(v_key::double precision);
    if v_got is distinct from v_want then
      raise exception
        'score_for_distance_km disagrees with scoring-service.ts: % km gave %, expected %. Nothing was rescored.',
        v_key, v_got, v_want;
    end if;
  end loop;

  if public.score_for_distance_km(null) <> 0
     or public.score_for_distance_km(-1) <> 0
     or public.score_for_distance_km('NaN'::double precision) <> 0 then
    raise exception 'score_for_distance_km does not fail closed. Nothing was rescored.';
  end if;

  raise notice 'curve verified against 15 reference vectors';
end;
$$;

-- ------------------------------------------------------------------ the rescore
do $$
declare
  v_sessions_before bigint;
  v_score_before bigint;
  v_score_after bigint;
  v_updated bigint;
  v_rounds bigint;
  v_null_distances bigint;
  v_unrescorable bigint;
  v_lost_keys bigint;
  v_bad_totals bigint;
  v_out_of_range bigint;
begin
  -- A session whose results are not a JSON array cannot be rescored. There were
  -- none when this was written; if that changes, say so loudly rather than
  -- skipping rows in silence.
  select count(*) into v_unrescorable
  from public.game_sessions
  where results is null or jsonb_typeof(results) <> 'array';

  if v_unrescorable > 0 then
    raise notice 'WARNING: % session(s) have no results array and were left untouched', v_unrescorable;
  end if;

  select count(*), coalesce(sum(total_score), 0)
    into v_sessions_before, v_score_before
  from public.game_sessions;

  -- Aliased as t(elem), not `as elem`. A set-returning function aliased with a
  -- bare name gives a TABLE alias whose column is `value`, so a bare `elem`
  -- would be a record and `elem ->> 'distance'` would fail on the type.
  select count(*),
         count(*) filter (where t.elem ->> 'distance' is null)
    into v_rounds, v_null_distances
  from public.game_sessions g
  cross join lateral jsonb_array_elements(g.results) as t(elem)
  where jsonb_typeof(g.results) = 'array';

  with rescored as (
    select
      g.id,
      -- `order by ord` matters: jsonb_agg has no inherent ordering, and the
      -- rounds must stay in the order they were played.
      jsonb_agg(
        jsonb_set(
          t.elem,
          '{score}',
          to_jsonb(
            public.score_for_distance_km((t.elem ->> 'distance')::double precision)
          )
        )
        order by t.ord
      ) as results,
      coalesce(
        sum(public.score_for_distance_km((t.elem ->> 'distance')::double precision)),
        0
      )::integer as total_score
    from public.game_sessions g
    cross join lateral jsonb_array_elements(g.results) with ordinality as t(elem, ord)
    where jsonb_typeof(g.results) = 'array'
      and jsonb_array_length(g.results) > 0
    group by g.id
  )
  update public.game_sessions s
  set results = r.results,
      total_score = r.total_score
  from rescored r
  where s.id = r.id
    -- Skip rows that are already correct, so the reported count means something
    -- and a rerun writes nothing at all.
    and (
      s.total_score is distinct from r.total_score
      or s.results is distinct from r.results
    );

  get diagnostics v_updated = row_count;

  select coalesce(sum(total_score), 0) into v_score_after from public.game_sessions;

  -- Integrity, checked inside this DO block so a failure rolls the update back.
  -- jsonb_set should replace only `score`, but a mistake in the path or a rebuilt
  -- object could quietly drop a sibling key, and the totals check below would not
  -- notice. Assert the shape survived.
  select count(*) into v_lost_keys
  from public.game_sessions g
  cross join lateral jsonb_array_elements(g.results) as r(elem)
  where jsonb_typeof(g.results) = 'array'
    and not (
      r.elem ? 'score'
      and r.elem ? 'distance'
      and r.elem ? 'roundNumber'
    );

  if v_lost_keys > 0 then
    raise exception
      'ROLLED BACK: % round result(s) lost a required key (score, distance or roundNumber).',
      v_lost_keys;
  end if;

  select count(*) into v_bad_totals
  from public.game_sessions g
  where jsonb_typeof(g.results) = 'array'
    and g.total_score is distinct from (
      select coalesce(sum((r.elem ->> 'score')::integer), 0)
      from jsonb_array_elements(g.results) as r(elem)
    );

  select count(*) into v_out_of_range
  from public.game_sessions g
  cross join lateral jsonb_array_elements(g.results) as r(elem)
  where jsonb_typeof(g.results) = 'array'
    and (
      (r.elem ->> 'score')::integer < 0
      or (r.elem ->> 'score')::integer > 5000
    );

  if v_bad_totals > 0 then
    raise exception
      'ROLLED BACK: % session(s) ended with total_score not equal to the sum of their round scores.',
      v_bad_totals;
  end if;

  if v_out_of_range > 0 then
    raise exception
      'ROLLED BACK: % round score(s) fell outside 0..5000.', v_out_of_range;
  end if;

  raise notice 'sessions inspected ....... %', v_sessions_before;
  raise notice 'sessions updated ......... %', v_updated;
  raise notice 'round results rescored ... % (% with distance null)', v_rounds, v_null_distances;
  raise notice 'aggregate total_score .... % -> %', v_score_before, v_score_after;
  raise notice 'integrity ................ every total matches its rounds, every score within 0..5000';
end;
$$;
