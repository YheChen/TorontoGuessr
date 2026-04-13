alter table public.verified_locations
  add column if not exists manually_verified boolean not null default false;

alter table public.verified_locations
  add column if not exists review_status text not null default 'pending';

alter table public.verified_locations
  drop constraint if exists verified_locations_review_status_check;

alter table public.verified_locations
  add constraint verified_locations_review_status_check
  check (review_status in ('pending', 'rejected', 'accepted'));

create index if not exists verified_locations_review_queue_idx
  on public.verified_locations (manually_verified, review_status, created_at);
