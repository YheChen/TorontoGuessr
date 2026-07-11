-- Game modes and server-side round deadlines.
--
-- round_started_at: when the current round was served to the player. The
-- backend rejects guesses that arrive long after the round timer expired
-- (treating them as timeouts), so the 60-second limit is enforced
-- server-side instead of trusting the client clock.
--
-- mode / challenge_date: distinguishes classic games from the daily
-- challenge, where every player gets the same five locations for a given
-- Toronto calendar date and competes on a per-day leaderboard.
--
-- The backend detects whether these columns exist and degrades gracefully
-- (no deadlines, daily games recorded as classic) until this migration is
-- applied, so it can be run at any time.

alter table public.game_sessions
  add column if not exists round_started_at timestamptz;

alter table public.game_sessions
  add column if not exists mode text not null default 'classic';

alter table public.game_sessions
  add column if not exists challenge_date date;

-- Serves the per-day challenge leaderboard.
create index if not exists game_sessions_challenge_idx
  on public.game_sessions (mode, challenge_date, total_score desc)
  where status = 'finished';
