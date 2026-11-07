-- =====================================================================
-- AI 미니게임 플랫폼 DB 첫 마이그레이션 (Supabase / Postgres)
-- GitHub main 브랜치에 올라가면 GitHub Actions(.github/workflows/supabase-deploy.yml)가
-- Supabase 프로젝트에 자동으로 적용해요. 한 번 적용된 이 파일은 고치지 마세요.
-- DB를 바꿀 땐 supabase/migrations/ 에 새 파일(예: 20261201000000_change.sql)을 추가해요.
--
-- 운영 규칙 숫자 (바꾸려면 새 마이그레이션 파일에서 해당 함수를 create or replace 하세요)
--   - 신고 자동 비공개: 서로 다른 유저 3명       → on_report_created()
--   - 하루 업로드 개수: 5개                     → create_game_upload()
--   - 계정 제재: 1회 경고, 2회 업로드 7일 정지, 3회 영구 정지 → apply_strike()
--   - 저작권 재게시 요청 기한: 통보 후 30일        → request_copyright_restore()
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 프로필 (Supabase Auth 계정 하나에 하나씩 자동 생성)
--    이메일·카카오·구글 로그인 연결 정보는 Supabase Auth(auth.identities)가 관리해요.
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text unique check (char_length(nickname) between 2 and 20),
  avatar_url text,
  bio text check (char_length(bio) <= 200),
  role text not null default 'user' check (role in ('user', 'admin')),
  status text not null default 'active' check (status in ('active', 'suspended', 'banned')),
  strike_count int not null default 0,
  suspended_until timestamptz,
  age_confirmed boolean not null default false, -- 만 14세 이상 확인
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;


-- ---------------------------------------------------------------------
-- 2. 카테고리 (관리자가 관리하는 고정 목록)
-- ---------------------------------------------------------------------
create table public.categories (
  id serial primary key,
  name text not null unique,
  sort_order int not null default 0
);

insert into public.categories (name, sort_order) values
  ('액션', 1), ('퍼즐', 2), ('캐주얼', 3), ('아케이드', 4), ('리듬', 5), ('스포츠', 6), ('기타', 7);


-- ---------------------------------------------------------------------
-- 3. 게임
--    태그는 따로 테이블을 두지 않고 text[] 컬럼에 저장해요 (검색은 GIN 인덱스).
-- ---------------------------------------------------------------------
create table public.games (
  id uuid primary key default gen_random_uuid(),
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  description text check (char_length(description) <= 2000),
  howto text check (char_length(howto) <= 1000),
  category_id int not null references public.categories(id),
  tags text[] not null default '{}',
  controls text not null check (controls in ('keyboard', 'touch', 'both')),
  ai_tool text,
  thumbnail_url text,
  status text not null default 'uploading'
    check (status in ('uploading', 'pending', 'published', 'rejected', 'hidden', 'hidden_copyright', 'deleted')),
  reject_reason text,
  storage_path text, -- 공개 중인 게임 파일 위치 (예: games/<id>/v1). 검수 워커가 채워요.
  current_version int not null default 0,
  leaderboard_enabled boolean not null default false,
  score_order text not null default 'desc' check (score_order in ('asc', 'desc')),
  play_count int not null default 0,
  like_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index games_status_created_idx on public.games (status, created_at desc);
create index games_uploader_idx on public.games (uploader_id);
create index games_tags_idx on public.games using gin (tags);

-- 업로드할 때마다 한 줄. 새 버전이 검사를 통과하면 games.storage_path 가 바뀌어요.
create table public.game_versions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  version_number int not null,
  upload_key text not null, -- R2에 올라간 원본 파일 키 (uploads/<게임id>/v<번호>/파일이름)
  status text not null default 'uploading' check (status in ('uploading', 'pending', 'passed', 'rejected')),
  reject_reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (game_id, version_number)
);


-- ---------------------------------------------------------------------
-- 4. 플레이 기록, 좋아요, 댓글, 점수
-- ---------------------------------------------------------------------
create table public.plays (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  counted boolean not null default false -- play_count에 반영됐는지 (같은 유저는 게임당 하루 1회)
);
create index plays_game_idx on public.plays (game_id, started_at);
create index plays_user_game_idx on public.plays (user_id, game_id, started_at);

create table public.likes (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade, -- 대댓글이면 원 댓글 id (1단계만)
  content text not null check (char_length(content) between 1 and 1000),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_game_idx on public.comments (game_id, created_at);

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  play_id uuid not null unique references public.plays(id) on delete cascade,
  score double precision not null,
  flagged boolean not null default false, -- 비정상 점수로 의심됨 (리더보드에서 빠지고 관리자 검토)
  created_at timestamptz not null default now()
);
create index scores_game_idx on public.scores (game_id, score);


-- ---------------------------------------------------------------------
-- 5. 신고, 저작권 신고, 알림
-- ---------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('game', 'comment')),
  game_id uuid references public.games(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('inappropriate', 'broken_spam', 'malicious')),
  status text not null default 'open' check (status in ('open', 'resolved_kept', 'resolved_removed')),
  created_at timestamptz not null default now(),
  check (
    (target_type = 'game' and game_id is not null and comment_id is null)
    or (target_type = 'comment' and comment_id is not null)
  )
);
create unique index reports_game_once on public.reports (game_id, reporter_id) where target_type = 'game';
create unique index reports_comment_once on public.reports (comment_id, reporter_id) where target_type = 'comment';

-- 저작권법 제103조 절차: 접수 즉시 비공개 → 권리자·업로더 통보 → 업로더는 30일 안에 재게시 요청 가능
--   → 재게시 예정일을 권리자에게 통보 → 예정일에 재게시 (권리자가 그 전에 소송 제기를 알리면 제외)
create table public.copyright_claims (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  claimant_name text not null,
  claimant_email text not null,
  work_description text not null,
  evidence_url text,
  status text not null default 'taken_down'
    check (status in ('taken_down', 'restore_requested', 'restore_scheduled', 'restored', 'closed')),
  uploader_notified_at timestamptz,
  restore_reason text,
  restore_due_date date,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in (
    'comment', 'reply', 'like',
    'review_passed', 'review_failed',
    'hidden_by_reports', 'game_restored', 'game_removed', 'strike',
    'copyright_takedown', 'copyright_restored'
  )),
  actor_id uuid references public.profiles(id) on delete set null,
  game_id uuid references public.games(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  claim_id uuid references public.copyright_claims(id) on delete cascade,
  message text,
  count int not null default 1, -- 좋아요 알림 묶음 ("외 n명")
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, is_read, created_at desc);


-- ---------------------------------------------------------------------
-- 6. 공개 게임 목록 뷰 (홈·검색·프로필 카드용)
--    소유자 권한으로 실행돼서 RLS를 거치지 않고, 공개(published) 게임만 보여줘요.
--    popular_score = 최근 7일 집계된 플레이 수 + 최근 7일 좋아요 수
-- ---------------------------------------------------------------------
create view public.published_games as
select
  g.id, g.title, g.description, g.thumbnail_url, g.controls, g.ai_tool, g.tags,
  g.category_id, c.name as category_name,
  g.uploader_id, p.nickname as uploader_nickname,
  g.play_count, g.like_count, g.leaderboard_enabled, g.created_at,
  (select count(*) from public.plays pl
     where pl.game_id = g.id and pl.counted and pl.started_at > now() - interval '7 days')
  + (select count(*) from public.likes l
     where l.game_id = g.id and l.created_at > now() - interval '7 days') as popular_score
from public.games g
join public.profiles p on p.id = g.uploader_id
left join public.categories c on c.id = g.category_id
where g.status = 'published';

revoke all on public.published_games from anon;
grant select on public.published_games to authenticated;


-- ---------------------------------------------------------------------
-- 7. 트리거: 좋아요 수, 알림, 대댓글 1단계 제한, 신고 자동 비공개, 저작권 신고
-- ---------------------------------------------------------------------
create function public.on_like_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_existing uuid;
begin
  if tg_op = 'INSERT' then
    update public.games set like_count = like_count + 1 where id = new.game_id returning uploader_id into v_owner;
    if v_owner is not null and v_owner <> new.user_id then
      -- 안 읽은 좋아요 알림이 있으면 새로 만들지 않고 묶어요
      select id into v_existing from public.notifications
        where user_id = v_owner and type = 'like' and game_id = new.game_id and not is_read
        limit 1;
      if v_existing is not null then
        update public.notifications
          set count = count + 1, actor_id = new.user_id, created_at = now()
          where id = v_existing;
      else
        insert into public.notifications (user_id, type, actor_id, game_id)
          values (v_owner, 'like', new.user_id, new.game_id);
      end if;
    end if;
    return new;
  else
    update public.games set like_count = greatest(like_count - 1, 0) where id = old.game_id;
    return old;
  end if;
end;
$$;

create trigger likes_change after insert or delete on public.likes
  for each row execute function public.on_like_change();


create function public.on_comment_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_parent public.comments;
begin
  if new.parent_id is not null then
    select * into v_parent from public.comments where id = new.parent_id;
    if v_parent.parent_id is not null then
      raise exception '답글에는 다시 답글을 달 수 없어요';
    end if;
    if v_parent.game_id <> new.game_id then
      raise exception '다른 게임의 댓글에 답글을 달 수 없어요';
    end if;
    if v_parent.user_id <> new.user_id then
      insert into public.notifications (user_id, type, actor_id, game_id, comment_id)
        values (v_parent.user_id, 'reply', new.user_id, new.game_id, new.id);
    end if;
  else
    select uploader_id into v_owner from public.games where id = new.game_id;
    if v_owner is not null and v_owner <> new.user_id then
      insert into public.notifications (user_id, type, actor_id, game_id, comment_id)
        values (v_owner, 'comment', new.user_id, new.game_id, new.id);
    end if;
  end if;
  return new;
end;
$$;

create trigger comments_created after insert on public.comments
  for each row execute function public.on_comment_created();


create function public.on_report_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_open int;
  v_owner uuid;
begin
  if new.target_type = 'game' then
    select count(distinct reporter_id) into v_open
      from public.reports where game_id = new.game_id and target_type = 'game' and status = 'open';
    if v_open >= 3 then
      update public.games set status = 'hidden', updated_at = now()
        where id = new.game_id and status = 'published'
        returning uploader_id into v_owner;
      if v_owner is not null then
        insert into public.notifications (user_id, type, game_id)
          values (v_owner, 'hidden_by_reports', new.game_id);
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger reports_created after insert on public.reports
  for each row execute function public.on_report_created();


create function public.on_copyright_claim_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
begin
  update public.games set status = 'hidden_copyright', updated_at = now()
    where id = new.game_id and status in ('published', 'hidden')
    returning uploader_id into v_owner;
  if v_owner is null then
    select uploader_id into v_owner from public.games where id = new.game_id;
  end if;
  update public.copyright_claims set uploader_notified_at = now() where id = new.id;
  insert into public.notifications (user_id, type, game_id, claim_id)
    values (v_owner, 'copyright_takedown', new.game_id, new.id);
  -- 권리자에게 보내는 접수 확인 메일은 아직 없어요. 이메일 발송 서비스를 붙일 때 여기서 보내세요.
  return new;
end;
$$;

create trigger copyright_claims_created after insert on public.copyright_claims
  for each row execute function public.on_copyright_claim_created();


-- ---------------------------------------------------------------------
-- 8. 앱에서 부르는 함수 (RPC)
-- ---------------------------------------------------------------------

-- 첫 로그인 후 닉네임 정하기 + 만 14세 이상 확인
create function public.complete_onboarding(p_nickname text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  update public.profiles set nickname = trim(p_nickname), age_confirmed = true where id = auth.uid();
end;
$$;

-- 플레이 시작. 같은 유저의 같은 게임은 하루(한국 시간) 1회만 play_count에 셉니다.
create function public.start_play(p_game_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_play uuid;
  v_counted boolean;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  if not exists (select 1 from public.games where id = p_game_id and status = 'published') then
    raise exception '플레이할 수 없는 게임이에요';
  end if;

  v_counted := not exists (
    select 1 from public.plays
    where user_id = auth.uid() and game_id = p_game_id and counted
      and (started_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
  );

  insert into public.plays (game_id, user_id, counted)
    values (p_game_id, auth.uid(), v_counted) returning id into v_play;

  if v_counted then
    update public.games set play_count = play_count + 1 where id = p_game_id;
  end if;
  return v_play;
end;
$$;

-- 리더보드 점수 제출 (게임 iframe → 플레이 페이지 → 이 함수)
create function public.submit_score(p_play_id uuid, p_score double precision) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_play public.plays;
  v_game public.games;
  v_best double precision;
  v_flag boolean := false;
begin
  select * into v_play from public.plays where id = p_play_id;
  if v_play.id is null or v_play.user_id <> auth.uid() then raise exception '잘못된 플레이예요'; end if;
  select * into v_game from public.games where id = v_play.game_id;
  if not v_game.leaderboard_enabled then raise exception '리더보드를 쓰지 않는 게임이에요'; end if;
  if p_score is null or p_score = 'NaN'::double precision or abs(p_score) > 1e12 then
    raise exception '점수가 올바르지 않아요';
  end if;
  -- 3초도 안 돼서 들어온 점수는 받지 않아요
  if now() - v_play.started_at < interval '3 seconds' then raise exception '너무 빨리 들어온 점수예요'; end if;

  -- 지금 1등 기록의 10배를 넘는 점수(낮을수록 좋은 게임은 1/10 미만)는 비정상으로 표시만 해둬요
  if v_game.score_order = 'desc' then
    select max(score) into v_best from public.scores where game_id = v_game.id and not flagged;
    v_flag := v_best is not null and v_best > 0 and p_score > v_best * 10;
  else
    select min(score) into v_best from public.scores where game_id = v_game.id and not flagged;
    v_flag := v_best is not null and v_best > 0 and p_score < v_best / 10;
  end if;

  insert into public.scores (game_id, user_id, play_id, score, flagged)
    values (v_game.id, auth.uid(), p_play_id, p_score, v_flag);
end;
$$;

-- 리더보드: 유저별 최고 기록
create function public.get_leaderboard(p_game_id uuid, p_limit int default 20)
returns table (rank bigint, nickname text, best_score double precision, is_me boolean)
language sql stable security definer set search_path = '' as $$
  with best as (
    select s.user_id,
           case when g.score_order = 'desc' then max(s.score) else min(s.score) end as best_score,
           g.score_order
    from public.scores s
    join public.games g on g.id = s.game_id
    where s.game_id = p_game_id and not s.flagged
    group by s.user_id, g.score_order
  )
  select rank() over (order by case when b.score_order = 'desc' then -b.best_score else b.best_score end) as rank,
         p.nickname, b.best_score, b.user_id = auth.uid() as is_me
  from best b join public.profiles p on p.id = b.user_id
  order by 1
  limit p_limit;
$$;

-- 업로드 시작: 하루 개수 제한과 계정 상태를 확인하고 게임·버전 줄을 만들어요.
-- p_game_id 를 넘기면 기존 게임의 새 버전 업로드예요.
create function public.create_game_upload(
  p_game_id uuid,
  p_title text, p_description text, p_howto text,
  p_category_id int, p_tags text[], p_controls text, p_ai_tool text,
  p_leaderboard boolean, p_score_order text,
  p_file_name text
) returns table (game_id uuid, version_number int, upload_key text)
language plpgsql security definer set search_path = '' as $$
declare
  v_me public.profiles;
  v_today int;
  v_game uuid := p_game_id;
  v_version int;
  v_key text;
begin
  select * into v_me from public.profiles where id = auth.uid();
  if v_me.id is null then raise exception '로그인이 필요해요'; end if;
  if v_me.status = 'banned' then raise exception '이용이 정지된 계정이에요'; end if;
  if v_me.status = 'suspended' and v_me.suspended_until > now() then
    raise exception '업로드가 정지된 계정이에요 (% 까지)', to_char(v_me.suspended_until at time zone 'Asia/Seoul', 'YYYY-MM-DD');
  end if;

  select count(*) into v_today from public.game_versions gv
    join public.games g on g.id = gv.game_id
    where g.uploader_id = auth.uid()
      and (gv.created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date;
  if v_today >= 5 then raise exception '오늘은 더 올릴 수 없어요 (하루 5개)'; end if;

  if v_game is null then
    insert into public.games (uploader_id, title, description, howto, category_id, tags, controls, ai_tool, leaderboard_enabled, score_order)
      values (auth.uid(), p_title, p_description, p_howto, p_category_id, coalesce(p_tags, '{}'), p_controls, p_ai_tool,
              coalesce(p_leaderboard, false), coalesce(p_score_order, 'desc'))
      returning id into v_game;
  else
    if not exists (select 1 from public.games where id = v_game and uploader_id = auth.uid() and status <> 'deleted') then
      raise exception '내 게임이 아니에요';
    end if;
    update public.games set title = p_title, description = p_description, howto = p_howto,
      category_id = p_category_id, tags = coalesce(p_tags, '{}'), controls = p_controls, ai_tool = p_ai_tool,
      leaderboard_enabled = coalesce(p_leaderboard, false), score_order = coalesce(p_score_order, 'desc'),
      updated_at = now()
      where id = v_game;
  end if;

  select coalesce(max(gv.version_number), 0) + 1 into v_version from public.game_versions gv where gv.game_id = v_game;
  v_key := 'uploads/' || v_game || '/v' || v_version || '/' || regexp_replace(p_file_name, '[^A-Za-z0-9._-]', '_', 'g');

  insert into public.game_versions (game_id, version_number, upload_key) values (v_game, v_version, v_key);
  return query select v_game, v_version, v_key;
end;
$$;

-- 파일을 R2에 다 올린 뒤 호출: 검사 대기열에 넣어요.
create function public.complete_game_upload(p_game_id uuid, p_version int, p_thumbnail_url text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.games where id = p_game_id and uploader_id = auth.uid()) then
    raise exception '내 게임이 아니에요';
  end if;
  update public.game_versions set status = 'pending'
    where game_id = p_game_id and version_number = p_version and status = 'uploading';
  update public.games set
      status = case when status in ('uploading', 'rejected') then 'pending' else status end,
      thumbnail_url = coalesce(p_thumbnail_url, thumbnail_url),
      updated_at = now()
    where id = p_game_id;
end;
$$;

-- 업로더가 저작권 신고에 대해 재게시를 요청 (통보 후 30일 안)
create function public.request_copyright_restore(p_claim_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_claim public.copyright_claims;
begin
  select * into v_claim from public.copyright_claims where id = p_claim_id;
  if not exists (select 1 from public.games where id = v_claim.game_id and uploader_id = auth.uid()) then
    raise exception '내 게임이 아니에요';
  end if;
  if v_claim.status <> 'taken_down' then raise exception '이미 처리 중인 신고예요'; end if;
  if now() > v_claim.uploader_notified_at + interval '30 days' then raise exception '재게시 요청 기한(30일)이 지났어요'; end if;
  update public.copyright_claims set status = 'restore_requested', restore_reason = p_reason where id = p_claim_id;
end;
$$;

-- 내 게임 삭제
create function public.delete_my_game(p_game_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.games set status = 'deleted', updated_at = now()
    where id = p_game_id and uploader_id = auth.uid();
end;
$$;


-- ---------------------------------------------------------------------
-- 9. 관리자 함수
-- ---------------------------------------------------------------------
create function public.apply_strike(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  update public.profiles set strike_count = strike_count + 1 where id = p_user_id returning strike_count into v_count;
  if v_count = 2 then
    update public.profiles set status = 'suspended', suspended_until = now() + interval '7 days' where id = p_user_id;
  elsif v_count >= 3 then
    update public.profiles set status = 'banned' where id = p_user_id;
  end if;
  insert into public.notifications (user_id, type, message)
    values (p_user_id, 'strike',
      case when v_count = 1 then '경고 1회를 받았어요. 2회부터 7일 동안 업로드가 정지돼요.'
           when v_count = 2 then '경고 2회로 7일 동안 업로드가 정지됐어요.'
           else '경고 3회로 계정 이용이 정지됐어요.' end);
end;
$$;
revoke execute on function public.apply_strike(uuid) from public, anon, authenticated;

-- 신고된 게임 처리: 삭제(제재 1회) 또는 복구
create function public.admin_resolve_game_reports(p_game_id uuid, p_remove boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
begin
  if not public.is_admin() then raise exception '관리자만 할 수 있어요'; end if;
  select uploader_id into v_owner from public.games where id = p_game_id;
  if p_remove then
    update public.games set status = 'deleted', updated_at = now() where id = p_game_id;
    update public.reports set status = 'resolved_removed' where game_id = p_game_id and status = 'open';
    insert into public.notifications (user_id, type, game_id) values (v_owner, 'game_removed', p_game_id);
    perform public.apply_strike(v_owner);
  else
    update public.games set status = 'published', updated_at = now() where id = p_game_id and status = 'hidden';
    update public.reports set status = 'resolved_kept' where game_id = p_game_id and status = 'open';
    insert into public.notifications (user_id, type, game_id) values (v_owner, 'game_restored', p_game_id);
  end if;
end;
$$;

-- 신고된 댓글 처리
create function public.admin_resolve_comment_reports(p_comment_id uuid, p_remove boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception '관리자만 할 수 있어요'; end if;
  if p_remove then
    update public.comments set is_hidden = true where id = p_comment_id;
  end if;
  update public.reports set status = case when p_remove then 'resolved_removed' else 'resolved_kept' end
    where comment_id = p_comment_id and status = 'open';
end;
$$;

-- 유저 정지·해제
create function public.admin_set_user_status(p_user_id uuid, p_status text, p_until timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception '관리자만 할 수 있어요'; end if;
  update public.profiles set status = p_status, suspended_until = p_until where id = p_user_id;
end;
$$;

-- 저작권 신고: 재게시 예정일 정하기 (권리자에게 예정일을 알린 뒤 호출) / 재게시 / 종료
create function public.admin_update_copyright_claim(p_claim_id uuid, p_status text, p_due date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_claim public.copyright_claims;
  v_owner uuid;
begin
  if not public.is_admin() then raise exception '관리자만 할 수 있어요'; end if;
  select * into v_claim from public.copyright_claims where id = p_claim_id;
  update public.copyright_claims set status = p_status, restore_due_date = coalesce(p_due, restore_due_date) where id = p_claim_id;
  if p_status = 'restored' then
    update public.games set status = 'published', updated_at = now()
      where id = v_claim.game_id and status = 'hidden_copyright'
      returning uploader_id into v_owner;
    if v_owner is not null then
      insert into public.notifications (user_id, type, game_id, claim_id)
        values (v_owner, 'copyright_restored', v_claim.game_id, p_claim_id);
    end if;
  end if;
end;
$$;

-- 대시보드 숫자
create function public.admin_stats() returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception '관리자만 할 수 있어요'; end if;
  return json_build_object(
    'users', (select count(*) from public.profiles),
    'uploads_today', (select count(*) from public.game_versions
                        where (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date),
    'plays_today', (select count(*) from public.plays
                      where (started_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date),
    'open_reports', (select count(*) from public.reports where status = 'open'),
    'open_claims', (select count(*) from public.copyright_claims where status in ('taken_down', 'restore_requested'))
  );
end;
$$;


-- ---------------------------------------------------------------------
-- 10. 권한 (RLS)
--     기본은 전부 막고, 필요한 것만 열어요. 상태를 바꾸는 일은 대부분 위 함수들이 해요.
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.games enable row level security;
alter table public.game_versions enable row level security;
alter table public.plays enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.scores enable row level security;
alter table public.reports enable row level security;
alter table public.copyright_claims enable row level security;
alter table public.notifications enable row level security;

-- 프로필: 로그인한 사람은 누구나 볼 수 있고, 본인은 닉네임·사진·소개만 고칠 수 있어요.
create policy "profiles readable" on public.profiles for select to authenticated using (true);
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (nickname, avatar_url, bio) on public.profiles to authenticated;

-- 카테고리: 누구나 읽기, 관리자만 수정
create policy "categories readable" on public.categories for select using (true);
create policy "categories admin" on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 게임: 공개 게임은 누구나(로그인), 내 게임은 상태와 상관없이, 관리자는 전부
create policy "games readable" on public.games for select to authenticated
  using (status = 'published' or uploader_id = auth.uid() or public.is_admin());
create policy "own game update" on public.games for update to authenticated using (uploader_id = auth.uid());
revoke update on public.games from authenticated, anon;
grant update (title, description, howto, category_id, tags, controls, ai_tool, leaderboard_enabled, score_order)
  on public.games to authenticated;

create policy "own versions readable" on public.game_versions for select to authenticated
  using (public.is_admin() or exists (select 1 from public.games g where g.id = game_id and g.uploader_id = auth.uid()));

create policy "own plays readable" on public.plays for select to authenticated using (user_id = auth.uid());

create policy "likes readable" on public.likes for select to authenticated using (true);
create policy "like myself" on public.likes for insert to authenticated with check (user_id = auth.uid());
create policy "unlike myself" on public.likes for delete to authenticated using (user_id = auth.uid());

create policy "comments readable" on public.comments for select to authenticated using (not is_hidden or public.is_admin());
create policy "comment myself" on public.comments for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.games g where g.id = game_id and g.status = 'published'));
create policy "delete own comment" on public.comments for delete to authenticated using (user_id = auth.uid());

create policy "own scores readable" on public.scores for select to authenticated using (user_id = auth.uid() or public.is_admin());

create policy "report myself" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "reports admin" on public.reports for select to authenticated using (public.is_admin());

-- 저작권 신고: 권리자는 회원이 아닐 수 있어서 로그인 없이도 접수할 수 있어요.
create policy "anyone can file claim" on public.copyright_claims for insert to anon, authenticated with check (status = 'taken_down');
create policy "claims admin" on public.copyright_claims for select to authenticated using (public.is_admin());
revoke insert on public.copyright_claims from anon, authenticated;
grant insert (game_id, claimant_name, claimant_email, work_description, evidence_url) on public.copyright_claims to anon, authenticated;

create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "mark own read" on public.notifications for update to authenticated using (user_id = auth.uid());
revoke update on public.notifications from authenticated, anon;
grant update (is_read) on public.notifications to authenticated;

-- 함수 실행 권한: 로그인한 사람만 (저작권 신고는 테이블 insert라 함수가 필요 없어요)
-- 트리거 함수는 이 권한과 상관없이 동작해요.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.apply_strike(uuid) from authenticated;
