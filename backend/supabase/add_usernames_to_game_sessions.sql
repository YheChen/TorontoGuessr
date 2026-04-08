alter table public.game_sessions
add column if not exists username text not null default 'Guest';

update public.game_sessions
set username = 'Guest'
where username is null or btrim(username) = '';
