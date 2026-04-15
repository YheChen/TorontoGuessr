create extension if not exists "pgcrypto";

create table if not exists public.verified_locations (
  id uuid primary key default gen_random_uuid(),
  lat double precision not null,
  lng double precision not null,
  pano_id text,
  manually_verified boolean not null default false,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'rejected', 'accepted')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.game_sessions (
  id uuid primary key,
  username text not null default 'Guest',
  rounds jsonb not null,
  current_round_index integer not null default 0,
  total_rounds integer not null,
  total_score integer not null default 0,
  results jsonb not null default '[]'::jsonb,
  rounds_played integer not null default 0,
  status text not null check (status in ('in_progress', 'finished')),
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

alter table public.verified_locations enable row level security;
alter table public.game_sessions enable row level security;

create index if not exists verified_locations_pano_id_idx
  on public.verified_locations (pano_id);

create index if not exists verified_locations_review_queue_idx
  on public.verified_locations (manually_verified, review_status, created_at);

create index if not exists game_sessions_leaderboard_idx
  on public.game_sessions (status, total_score desc, completed_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists verified_locations_set_updated_at
  on public.verified_locations;

create trigger verified_locations_set_updated_at
before update on public.verified_locations
for each row
execute function public.set_updated_at();
