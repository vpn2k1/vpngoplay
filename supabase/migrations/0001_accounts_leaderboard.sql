-- VpngoPlay: accounts, cloud progress and leaderboards.
-- Run once in the Supabase SQL editor (or `supabase db push`).
--
-- Tables
--   profiles     public name + avatar shown on leaderboards (never the email)
--   progress     private snapshot of the learner's progress (XP, streak, flashcards, word book, records)
--   daily_xp     XP earned per day, for the weekly / all-time XP boards
--   game_scores  best score per arcade game, for the game boards
-- Leaderboard data is read through security-definer functions, so other people's rows
-- are never exposed directly. XP and scores are written only through functions that clamp values.

-- ---------------------------------------------------------------------------
-- Profiles

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 32),
  avatar text not null default '🙂' check (char_length(avatar) <= 16),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are readable by everyone" on public.profiles
  for select using (true);
create policy "Users update their own profile" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- A profile is created for every new account, named after the Google name or the email's local part.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(new.raw_user_meta_data ->> 'full_name', ''),
        nullif(new.raw_user_meta_data ->> 'name', ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Người học'
      ),
      32
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Progress snapshot (private to its owner)

create table public.progress (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;

create policy "Users read their own progress" on public.progress
  for select using ((select auth.uid()) = user_id);
create policy "Users insert their own progress" on public.progress
  for insert with check ((select auth.uid()) = user_id);
create policy "Users update their own progress" on public.progress
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Leaderboard sources (owners can read their rows; writes go through the functions below)

create table public.daily_xp (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  xp integer not null check (xp between 0 and 20000),
  primary key (user_id, day)
);

create table public.game_scores (
  user_id uuid not null references auth.users on delete cascade,
  game text not null check (game ~ '^[a-z]{2,20}$'),
  score integer not null check (score between 0 and 10000000),
  updated_at timestamptz not null default now(),
  primary key (user_id, game)
);

create index daily_xp_day_idx on public.daily_xp (day);
create index game_scores_game_idx on public.game_scores (game, score desc);

alter table public.daily_xp enable row level security;
alter table public.game_scores enable row level security;

create policy "Users read their own daily xp" on public.daily_xp
  for select using ((select auth.uid()) = user_id);
create policy "Users read their own scores" on public.game_scores
  for select using ((select auth.uid()) = user_id);

-- Today's XP total (the client sends its running total; the larger value wins, so two devices
-- don't double count). Only yesterday..tomorrow is accepted, to allow for time zones.
create function public.record_daily_xp(p_day date, p_xp integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  if p_day not between current_date - 1 and current_date + 1 then
    raise exception 'day out of range';
  end if;
  insert into public.daily_xp (user_id, day, xp)
  values ((select auth.uid()), p_day, least(greatest(p_xp, 0), 20000))
  on conflict (user_id, day) do update set xp = greatest(public.daily_xp.xp, excluded.xp);
end;
$$;

-- Best score of a game (kept if higher than the stored one).
create function public.submit_game_score(p_game text, p_score integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  insert into public.game_scores (user_id, game, score)
  values ((select auth.uid()), p_game, least(greatest(p_score, 0), 10000000))
  on conflict (user_id, game) do update
    set score = excluded.score, updated_at = now()
    where excluded.score > public.game_scores.score;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leaderboards: the top `p_limit` rows plus the caller's own row when outside the top.
-- Weeks start on Monday, in Vietnam time.

create function public.leaderboard_xp(p_period text default 'week', p_limit integer default 50)
returns table (rank bigint, user_id uuid, display_name text, avatar text, xp bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with totals as (
    select d.user_id, sum(d.xp)::bigint as xp
    from public.daily_xp d
    where p_period = 'all'
       or d.day >= date_trunc('week', (now() at time zone 'Asia/Ho_Chi_Minh'))::date
    group by d.user_id
    having sum(d.xp) > 0
  ),
  ranked as (
    select rank() over (order by t.xp desc) as rank, t.user_id, p.display_name, p.avatar, t.xp
    from totals t
    join public.profiles p on p.id = t.user_id
  )
  select * from ranked
  where rank <= least(greatest(p_limit, 1), 100) or user_id = (select auth.uid())
  order by rank, display_name;
$$;

create function public.leaderboard_game(p_game text, p_limit integer default 50)
returns table (rank bigint, user_id uuid, display_name text, avatar text, score integer)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select rank() over (order by s.score desc) as rank, s.user_id, p.display_name, p.avatar, s.score
    from public.game_scores s
    join public.profiles p on p.id = s.user_id
    where s.game = p_game and s.score > 0
  )
  select * from ranked
  where rank <= least(greatest(p_limit, 1), 100) or user_id = (select auth.uid())
  order by rank, display_name;
$$;

-- Writes need an account; the boards are public.
revoke execute on function public.record_daily_xp(date, integer) from public, anon;
revoke execute on function public.submit_game_score(text, integer) from public, anon;
grant execute on function public.record_daily_xp(date, integer) to authenticated;
grant execute on function public.submit_game_score(text, integer) to authenticated;
grant execute on function public.leaderboard_xp(text, integer) to anon, authenticated;
grant execute on function public.leaderboard_game(text, integer) to anon, authenticated;
