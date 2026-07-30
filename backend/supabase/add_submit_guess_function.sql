-- Atomic guess scoring in SQL.
--
-- submitGuess() in the backend currently makes two sequential Supabase round
-- trips per guess: read the session, then update it. This function collapses
-- that into ONE call by reading, scoring, and writing inside the database
-- under a row lock. Co-locating the function with the DB (see vercel.json
-- regions) plus halving the round trips is the last guess-path latency win.
--
-- This is a faithful port of submitGuess (backend/src/game-store.ts):
--   * 60s round limit + 15s grace = 75s deadline; late guesses score as a
--     timeout. Sessions without round_started_at are exempt (legacy).
--   * haversine distance in km, scored by public.score_for_distance_km below,
--     which is the SQL half of a formula that also lives in
--     backend/src/scoring-service.ts. See that function's comment.
--   * appends the round result, advances the round, finishes the game on the
--     last round, and baselines the next round's deadline at guess time.
-- The FOR UPDATE lock makes it atomic, so it also removes the optimistic
-- concurrency guard the JS path needs.
--
-- ACTIVATION: the backend only calls this when GUESS_RPC_ENABLED=true. It
-- requires the mode/challenge_date/round_started_at columns (from
-- add_usernames_to_game_sessions / the daily-challenge migration). Apply this,
-- verify with a real game, THEN set the flag. With the flag off the backend
-- uses the original two-call JS path, so applying this migration alone changes
-- nothing.
--
-- The reference vectors are no longer restated in prose here. Prose goes stale
-- silently; the assertion block at the end of this file does not.

-- ---------------------------------------------------------------- the curve
--
-- The scoring formula, duplicated from calculateScore in
-- backend/src/scoring-service.ts. The duplication is deliberate and cannot be
-- removed without giving up the reason this file exists: scoring has to happen
-- inside the row lock to stay atomic and single-round-trip.
--
-- Pulled out of submit_guess into its own function so there is exactly ONE
-- copy of the arithmetic in SQL, and so the assertion block at the end of this
-- file can execute it directly.
--
-- Two things must hold for the two languages to agree exactly:
--
--   1. Only multiplication, division, addition. No exp, log or power. Restricted
--      to those, IEEE 754 gives bit-identical results in both languages.
--   2. round() on ::numeric, NOT on double precision. Postgres rounds float8
--      via rint(), which is banker's rounding: round(0.5::float8) = 0. JS
--      Math.round is half-up: Math.round(0.5) = 1. Casting to numeric first
--      gives half-away-from-zero, which matches JS for the non-negative values
--      this function produces. Getting this wrong costs one point on exact
--      halves and is invisible until someone compares boards.
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
    when p_distance_km is null then 0
    when p_distance_km <> p_distance_km then 0            -- NaN
    when p_distance_km < 0 then 0
    when p_distance_km = 'Infinity'::double precision then 0
    when p_distance_km <= 0.1 then 5000
    -- The division is forced into double precision so it matches the JS exactly;
    -- only the finished value becomes numeric, purely to get JS rounding.
    else round(
      (
        5000.0::double precision
        / (1 + (p_distance_km - 0.1) * (p_distance_km - 0.1))
      )::numeric
    )::integer
  end;
$$;

create or replace function public.submit_guess(
  p_session_id uuid,
  p_guess_lat double precision default null,
  p_guess_lng double precision default null
)
returns jsonb
language plpgsql
volatile
as $$
declare
  v_session public.game_sessions%rowtype;
  v_round jsonb;
  v_round_index integer;
  v_actual_lat double precision;
  v_actual_lng double precision;
  v_is_late boolean := false;
  v_has_guess boolean;
  v_use_guess boolean;
  v_distance double precision;
  v_score integer;
  v_result jsonb;
  v_new_index integer;
  v_game_finished boolean;
  v_next_round jsonb := null;
  v_now timestamptz := now();
begin
  select * into v_session
  from public.game_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Game session not found.';
  end if;
  if v_session.status <> 'in_progress' then
    raise exception 'Game session is already complete.';
  end if;

  v_round_index := v_session.current_round_index;
  v_round := v_session.rounds -> v_round_index;
  if v_round is null then
    raise exception 'No active round found for this session.';
  end if;

  v_actual_lat := (v_round ->> 'lat')::double precision;
  v_actual_lng := (v_round ->> 'lng')::double precision;

  -- Deadline enforcement (75s). Legacy rows without a start time are exempt.
  if v_session.round_started_at is not null
     and extract(epoch from (v_now - v_session.round_started_at)) > 75 then
    v_is_late := true;
  end if;

  v_has_guess := p_guess_lat is not null and p_guess_lng is not null;
  v_use_guess := v_has_guess and not v_is_late;

  if not v_use_guess then
    v_distance := null;
    v_score := 0;
  else
    v_distance := 6371 * 2 * asin(
      least(1, sqrt(
        power(sin(radians(v_actual_lat - p_guess_lat) / 2), 2) +
        cos(radians(p_guess_lat)) * cos(radians(v_actual_lat)) *
        power(sin(radians(v_actual_lng - p_guess_lng) / 2), 2)
      ))
    );
    v_score := public.score_for_distance_km(v_distance);
  end if;

  v_result := jsonb_build_object(
    'roundNumber', v_round_index + 1,
    'score', v_score,
    'distance', v_distance,
    'guessLocation',
      case when v_use_guess
        then jsonb_build_object('lat', p_guess_lat, 'lng', p_guess_lng)
        else null end,
    'actualLocation', jsonb_build_object('lat', v_actual_lat, 'lng', v_actual_lng)
  );

  v_new_index := v_round_index + 1;
  v_game_finished := v_new_index >= v_session.total_rounds;

  update public.game_sessions set
    results = coalesce(results, '[]'::jsonb) || v_result,
    total_score = total_score + v_score,
    current_round_index = v_new_index,
    rounds_played = jsonb_array_length(coalesce(results, '[]'::jsonb)) + 1,
    status = case when v_game_finished then 'finished' else status end,
    completed_at = case when v_game_finished then v_now else completed_at end,
    round_started_at = v_now
  where id = p_session_id;

  if not v_game_finished then
    v_next_round := jsonb_build_object(
      'currentRound', v_new_index + 1,
      'totalRounds', v_session.total_rounds,
      'round', jsonb_build_object(
        'panoId', v_session.rounds -> v_new_index ->> 'panoId',
        'heading', (v_session.rounds -> v_new_index ->> 'heading')::double precision,
        'pitch', (v_session.rounds -> v_new_index ->> 'pitch')::double precision,
        'zoom', (v_session.rounds -> v_new_index ->> 'zoom')::double precision
      ),
      'timeLimit', 60
    );
  end if;

  return jsonb_build_object(
    'result', v_result,
    'totalScore', v_session.total_score + v_score,
    'gameFinished', v_game_finished,
    'isLastRound', v_game_finished,
    'guessRejectedLate', v_is_late and v_has_guess,
    'nextRound', v_next_round
  );
end;
$$;

-- ------------------------------------------------- cross-language self-check
--
-- The same reference vectors asserted in backend/tests/scoring-service.test.ts.
-- If the SQL copy of the curve drifts from the TypeScript one, this aborts the
-- migration instead of installing a function that quietly scores differently.
--
-- This is the only executable check that the two implementations agree: there is
-- no database integration test in CI, so without this the SQL port is verified
-- by eye alone. It runs at apply time, which is late but is strictly better than
-- never. Do not delete it to make the migration "cleaner".
do $$
declare
  v_expected constant jsonb := jsonb_build_object(
    '0',     5000,
    '0.05',  5000,
    '0.1',   5000,
    '0.25',  4890,
    '0.5',   4310,
    '1',     2762,
    '1.1',   2500,
    '2',     1085,
    '2.1',   1000,
    '3',      531,
    '5',      200,
    '10',      50,
    '20',      13,
    '40',       3,
    '200',      0
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
        'score_for_distance_km has drifted from scoring-service.ts: % km gave %, expected %. Fix the SQL curve before applying.',
        v_key, v_got, v_want;
    end if;
  end loop;

  -- Fail-closed behaviour, which matters more than any single vector: broken
  -- input must score zero, never a perfect round.
  if public.score_for_distance_km(null) <> 0
     or public.score_for_distance_km(-1) <> 0
     or public.score_for_distance_km('NaN'::double precision) <> 0
     or public.score_for_distance_km('Infinity'::double precision) <> 0 then
    raise exception 'score_for_distance_km does not fail closed on invalid input.';
  end if;
end;
$$;
