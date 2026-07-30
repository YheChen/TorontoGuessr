-- Multiplayer lobbies: 2 to 8 players race through the same five rounds.
--
-- Design constraints this schema is shaped by:
--
-- 1. The backend is stateless Vercel functions, so there is no process to hold
--    a socket or run a timer. Round progression is driven by the timestamps
--    below: every request "settles" the lobby (scoring absent players as
--    timeouts and advancing the round) before responding. No cron needed.
--
-- 2. lobbies.rounds holds answer coordinates, so this table must stay
--    service-role only. Row level security is enabled with no policies,
--    matching the other tables, which blocks the anon key entirely. If push
--    sync is added later it must use Realtime broadcast (which does not touch
--    tables) rather than Postgres Changes, which would need an anon SELECT
--    policy here and would leak the answers.
--
-- 3. Lobbies are ephemeral. Scores live only for the life of the lobby and
--    never feed the global leaderboard: display names are unauthenticated, so
--    ranking them would be meaningless. expires_at supports lazy cleanup
--    without a scheduled job.
--
-- The backend detects whether these tables exist and reports multiplayer as
-- unavailable until this migration is applied, so it can be run at any time.

create table if not exists public.lobbies (
  id uuid primary key,
  join_code text not null unique,
  status text not null default 'waiting'
    check (status in ('waiting', 'in_progress', 'finished')),
  host_player_id uuid not null,
  rounds jsonb not null default '[]',
  total_rounds integer not null default 5,
  current_round_index integer not null default 0,
  round_time_limit_seconds integer not null default 60,
  -- Guessing phase: when the current round stops accepting guesses.
  round_started_at timestamptz,
  round_deadline_at timestamptz,
  -- Reveal phase: the host can advance early, and this auto-advances
  -- otherwise so a lobby never stalls when the host leaves.
  round_revealed boolean not null default false,
  reveal_deadline_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null
);

create table if not exists public.lobby_players (
  -- Public id: safe to return to every player in the lobby.
  id uuid primary key,
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  -- sha256 of the client's per-lobby token. Authenticates that player's
  -- writes and is NEVER returned in any payload, so a leaked row cannot be
  -- replayed as a credential.
  player_token_hash text not null,
  display_name text not null,
  total_score integer not null default 0,
  results jsonb not null default '[]',
  is_connected boolean not null default true,
  last_seen_at timestamptz not null default timezone('utc', now()),
  joined_at timestamptz not null default timezone('utc', now()),
  unique (lobby_id, player_token_hash)
);

-- Serves the in-lobby scoreboard.
create index if not exists lobby_players_lobby_idx
  on public.lobby_players (lobby_id, total_score desc);

-- Supports lazy cleanup of abandoned lobbies.
create index if not exists lobbies_expires_idx
  on public.lobbies (expires_at)
  where status <> 'finished';

alter table public.lobbies enable row level security;
alter table public.lobby_players enable row level security;
