-- =====================================================================
-- 공식 계정 표시
--   운영팀 에이전트가 만든 게임(games/ 폴더)을 올리는 계정이에요.
--   이 계정이 올린 게임에는 카드·게임 페이지·프로필에 '공식' 배지가 붙어요.
--
--   일반 회원은 이 값을 바꿀 수 없어요 (profiles는 nickname, avatar_url, bio만 직접 수정 가능).
--   공식 계정 지정은 Supabase 대시보드 > SQL Editor에서 직접 해요:
--     update public.profiles set is_official = true where nickname = '<공식 계정 닉네임>';
-- =====================================================================

alter table public.profiles add column is_official boolean not null default false;

-- 카드에 배지를 보여주려고 published_games 뷰 끝에 uploader_is_official 을 추가해요.
-- (create or replace view 는 기존 컬럼 순서를 그대로 두고 끝에만 추가할 수 있어요)
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
  p.is_official as uploader_is_official
from public.games g
join public.profiles p on p.id = g.uploader_id
left join public.categories c on c.id = g.category_id
where g.status = 'published';

revoke all on public.published_games from anon;
grant select on public.published_games to authenticated;
