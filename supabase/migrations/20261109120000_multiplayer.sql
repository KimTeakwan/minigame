-- =====================================================================
-- 동시 접속자 수 + 멀티플레이 (로블록스식 방)
--
--   live_players  지금 게임 화면을 보고 있는 사람 (한 사람당 한 줄).
--                 플레이 페이지가 30초마다 heartbeat()를 부르고, 75초 동안 소식이 없으면 나간 걸로 봐요.
--   game_rooms    멀티 게임의 방(서버). join_room()이 빈자리가 있는 방부터 채우고, 없으면 새로 만들어요.
--
--   실시간 메시지는 Supabase Realtime 비공개 채널 'room:<방 id>'로 주고받아요.
--   그 방에 들어와 있는 사람만 듣고 보낼 수 있게 realtime.messages에 RLS를 걸어요.
--   게임 iframe은 네트워크에 직접 접속하지 않아요. 플레이 페이지가 중계해요 (lib/multiplayer.ts).
-- =====================================================================

-- 접속 중으로 보는 기준 시각 (heartbeat 30초 + 여유)
create function public.live_cutoff() returns timestamptz
language sql stable as $$ select now() - interval '75 seconds' $$;

-- ---------------------------------------------------------------------
-- 1. 게임 설정: 멀티 여부와 방 하나의 최대 인원
-- ---------------------------------------------------------------------
alter table public.games
  add column multiplayer boolean not null default false,
  add column max_players smallint not null default 1;
alter table public.games add constraint games_max_players_check
  check ((multiplayer and max_players between 2 and 8) or (not multiplayer and max_players = 1));

-- ---------------------------------------------------------------------
-- 2. 방과 접속자
-- ---------------------------------------------------------------------
create table public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  locked boolean not null default false, -- 판이 시작되면 게임이 잠가서 새 사람이 못 들어오게 해요
  created_at timestamptz not null default now()
);
create index game_rooms_game_idx on public.game_rooms (game_id, created_at);

create table public.live_players (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  room_id uuid references public.game_rooms(id) on delete set null,
  last_seen timestamptz not null default now()
);
create index live_players_game_idx on public.live_players (game_id, last_seen);
create index live_players_room_idx on public.live_players (room_id, last_seen);

-- 직접 읽고 쓰지 않아요. 숫자는 아래 뷰로 보고, 기록은 함수로만 해요.
alter table public.game_rooms enable row level security;
alter table public.live_players enable row level security;
revoke all on public.game_rooms, public.live_players from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. 함수
-- ---------------------------------------------------------------------

-- 플레이 페이지가 30초마다 불러요. p_keep_room이 true면 join_room()으로 들어간 방을 유지해요.
-- (방 번호를 직접 받지 않아서, 정원이 찬 방이나 잠긴 방에 끼어들 수 없어요)
create function public.heartbeat(p_game_id uuid, p_keep_room boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  if not exists (select 1 from public.games where id = p_game_id and status = 'published') then return; end if;

  insert into public.live_players (user_id, game_id, room_id, last_seen)
    values (auth.uid(), p_game_id, null, now())
  on conflict (user_id) do update set
    room_id = case when p_keep_room and public.live_players.game_id = excluded.game_id
                   then public.live_players.room_id end,
    game_id = excluded.game_id,
    last_seen = now();
end;
$$;

-- 게임 화면을 떠날 때 (접속자 수에서 바로 빠져요)
create function public.leave_game() returns void
language sql security definer set search_path = '' as $$
  delete from public.live_players where user_id = auth.uid();
$$;

-- 멀티 방 들어가기: 사람이 있고 빈자리가 있는 방 중 가장 많이 찬 방 → 없으면 새 방.
-- 돌려주는 값: {"room_id": "...", "max_players": 4}
create function public.join_room(p_game_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_game public.games;
  v_room uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  select * into v_game from public.games where id = p_game_id and status = 'published';
  if v_game.id is null then raise exception '플레이할 수 없는 게임이에요'; end if;
  if not v_game.multiplayer then raise exception '멀티 게임이 아니에요'; end if;

  -- 같은 게임에 동시에 들어오는 사람을 한 명씩 처리해서 정원을 넘기지 않아요
  perform pg_advisory_xact_lock(hashtextextended('join_room:' || p_game_id::text, 0));

  -- 이미 이 게임의 방에 있으면 그 방으로 (새로고침·연결 끊김)
  select lp.room_id into v_room
    from public.live_players lp
   where lp.user_id = auth.uid() and lp.game_id = p_game_id and lp.room_id is not null
     and lp.last_seen > public.live_cutoff();

  if v_room is null then
    select r.id into v_room
      from public.game_rooms r
      cross join lateral (
        select count(*) as n from public.live_players lp
         where lp.room_id = r.id and lp.user_id <> auth.uid() and lp.last_seen > public.live_cutoff()
      ) c
     where r.game_id = p_game_id and not r.locked and c.n between 1 and v_game.max_players - 1
     order by c.n desc, r.created_at
     limit 1;
  end if;

  if v_room is null then
    insert into public.game_rooms (game_id) values (p_game_id) returning id into v_room;
  end if;

  insert into public.live_players (user_id, game_id, room_id, last_seen)
    values (auth.uid(), p_game_id, v_room, now())
  on conflict (user_id) do update set game_id = excluded.game_id, room_id = excluded.room_id, last_seen = now();

  -- 아무도 없는 채로 10분 지난 방 정리
  delete from public.game_rooms r
   where r.game_id = p_game_id and r.id <> v_room and r.created_at < now() - interval '10 minutes'
     and not exists (select 1 from public.live_players lp where lp.room_id = r.id and lp.last_seen > public.live_cutoff());

  return jsonb_build_object('room_id', v_room, 'max_players', v_game.max_players);
end;
$$;

-- 멀티 방에서 나가기 (게임 화면에는 남아 있어요)
create function public.leave_room() returns void
language sql security definer set search_path = '' as $$
  update public.live_players set room_id = null where user_id = auth.uid();
$$;

-- 방 잠그기/풀기: 판이 시작되면 잠가서 중간에 새 사람이 들어오지 않게 해요. 방 안에 있는 사람만 할 수 있어요.
create function public.set_room_locked(p_room_id uuid, p_locked boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.live_players
     where user_id = auth.uid() and room_id = p_room_id and last_seen > public.live_cutoff()
  ) then
    raise exception '이 방에 있지 않아요';
  end if;
  update public.game_rooms set locked = coalesce(p_locked, false) where id = p_room_id;
end;
$$;

-- 업로더가 내 게임의 멀티 설정을 바꿔요 (업로드할 때 같이 불러요)
create function public.set_game_multiplayer(p_game_id uuid, p_multiplayer boolean, p_max_players int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.games where id = p_game_id and uploader_id = auth.uid() and status <> 'deleted') then
    raise exception '내 게임이 아니에요';
  end if;
  if coalesce(p_multiplayer, false) and (p_max_players is null or p_max_players < 2 or p_max_players > 8) then
    raise exception '멀티 게임은 한 방에 2~8명이에요';
  end if;
  update public.games set
      multiplayer = coalesce(p_multiplayer, false),
      max_players = case when coalesce(p_multiplayer, false) then p_max_players else 1 end,
      updated_at = now()
    where id = p_game_id;
end;
$$;

-- 사이트 전체 접속자 수 (헤더에 보여줘요)
create function public.site_live_count() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.live_players where last_seen > public.live_cutoff();
$$;

-- Realtime 권한 확인용: 지금 이 채널('room:<방 id>')의 방에 들어와 있는지
create function public.in_realtime_room(p_topic text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.live_players lp
     where lp.user_id = auth.uid() and lp.room_id is not null
       and p_topic = 'room:' || lp.room_id::text
       and lp.last_seen > public.live_cutoff()
  );
$$;

-- ---------------------------------------------------------------------
-- 4. 게임별 접속자 수
-- ---------------------------------------------------------------------
create view public.game_live_counts as
select game_id, count(*)::int as players
  from public.live_players
 where last_seen > public.live_cutoff()
 group by game_id;

revoke all on public.game_live_counts from anon;
grant select on public.game_live_counts to authenticated;

-- 카드에 접속자 수와 멀티 표시를 보여주려고 published_games 뷰 끝에 컬럼을 추가해요
create or replace view public.published_games as
select
  g.id, g.title, g.description, g.thumbnail_url, g.controls, g.ai_tool, g.tags,
  g.category_id, c.name as category_name,
  g.uploader_id, p.nickname as uploader_nickname,
  g.play_count, g.like_count, g.leaderboard_enabled, g.created_at,
  (select count(*) from public.plays pl
     where pl.game_id = g.id and pl.counted and pl.started_at > now() - interval '7 days')
  + (select count(*) from public.likes l
     where l.game_id = g.id and l.created_at > now() - interval '7 days') as popular_score,
  p.is_official as uploader_is_official,
  g.multiplayer,
  g.max_players,
  (select count(*) from public.live_players lp
     where lp.game_id = g.id and lp.last_seen > public.live_cutoff())::int as live_count
from public.games g
join public.profiles p on p.id = g.uploader_id
left join public.categories c on c.id = g.category_id
where g.status = 'published';

revoke all on public.published_games from anon;
grant select on public.published_games to authenticated;

-- ---------------------------------------------------------------------
-- 5. Realtime 비공개 채널 권한: 그 방에 들어와 있는 사람만 듣고(select) 보내요(insert)
--    플레이 페이지는 채널을 { private: true }로 열어요.
--    Supabase 대시보드 > Realtime > Settings에서 'Allow public access'를 끄면 비공개 채널만 쓸 수 있어요.
-- ---------------------------------------------------------------------
create policy "멀티 방 사람만 받기" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and public.in_realtime_room((select realtime.topic()))
  );

create policy "멀티 방 사람만 보내기" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and public.in_realtime_room((select realtime.topic()))
  );

-- ---------------------------------------------------------------------
-- 6. 실행 권한: 로그인한 회원만
-- ---------------------------------------------------------------------
revoke execute on function
  public.live_cutoff(), public.heartbeat(uuid, boolean), public.leave_game(), public.join_room(uuid),
  public.leave_room(), public.set_room_locked(uuid, boolean), public.set_game_multiplayer(uuid, boolean, int),
  public.site_live_count(), public.in_realtime_room(text)
  from public, anon;
grant execute on function
  public.live_cutoff(), public.heartbeat(uuid, boolean), public.leave_game(), public.join_room(uuid),
  public.leave_room(), public.set_room_locked(uuid, boolean), public.set_game_multiplayer(uuid, boolean, int),
  public.site_live_count(), public.in_realtime_room(text)
  to authenticated;
