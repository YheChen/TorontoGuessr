-- Daily game stats, aggregated in SQL.
--
-- The backend previously fetched raw game_sessions rows and bucketed them by
-- day in JavaScript. PostgREST caps responses at 1,000 rows by default, so
-- once a range contained more than 1,000 sessions the stats silently
-- undercounted. This function aggregates in the database and returns one row
-- per day, so the response size is bounded by the number of days requested.
--
-- The backend calls this via PostgREST RPC and falls back to the legacy row
-- scan if the function does not exist yet, so this migration can be applied
-- at any time.

create or replace function public.daily_game_stats(days_count integer, tz text)
returns table (
  date text,
  games_started integer,
  games_finished integer
)
language sql
stable
as $$
  with bounds as (
    select
      ((now() at time zone tz)::date - (days_count - 1)) as start_day,
      (now() at time zone tz)::date as end_day
  ),
  series as (
    select generate_series(
      (select start_day from bounds),
      (select end_day from bounds),
      interval '1 day'
    )::date as day
  ),
  started as (
    select (created_at at time zone tz)::date as day, count(*) as total
    from public.game_sessions, bounds
    where (created_at at time zone tz)::date >= bounds.start_day
    group by 1
  ),
  finished as (
    select (completed_at at time zone tz)::date as day, count(*) as total
    from public.game_sessions, bounds
    where status = 'finished'
      and completed_at is not null
      and (completed_at at time zone tz)::date >= bounds.start_day
    group by 1
  )
  select
    to_char(series.day, 'YYYY-MM-DD') as date,
    coalesce(started.total, 0)::integer as games_started,
    coalesce(finished.total, 0)::integer as games_finished
  from series
  left join started on started.day = series.day
  left join finished on finished.day = series.day
  order by series.day;
$$;

-- Leaderboard reads filter finished sessions and order by score, then
-- completion time. This index lets both the page query and the exact count
-- run without scanning the whole table.
create index if not exists game_sessions_leaderboard_idx
  on public.game_sessions (status, total_score desc, completed_at asc);

-- Time-window filters: period leaderboards (completed_at >= X) and the
-- stats aggregation ranges over created_at / completed_at.
create index if not exists game_sessions_status_completed_at_idx
  on public.game_sessions (status, completed_at desc);

create index if not exists game_sessions_created_at_idx
  on public.game_sessions (created_at);
