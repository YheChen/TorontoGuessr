alter table public.game_sessions
add column if not exists username text not null default ('Guest ' || lpad(floor(random() * 10000)::text, 4, '0'));

update public.game_sessions
set username = 'Guest ' || lpad(floor(random() * 10000)::text, 4, '0')
where username is null or btrim(username) = '';
