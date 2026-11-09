# 프로젝트 안내 (AI 코딩 툴용)

AI로 만든 HTML 미니게임을 누구나 올리고 회원들이 플레이하는 사이트. 옛 플래시 게임 포털 '점심먹고노라라' + 로블록스식 사용자 제작 게임 허브.

## 스택
- Next.js 16 App Router, TypeScript, Tailwind CSS v4 (토큰은 `app/globals.css`의 `@theme`)
- Supabase: Postgres + Auth(이메일·카카오·구글). `@supabase/ssr`로 서버/브라우저 클라이언트 분리 (`lib/supabase/`)
- Cloudflare R2: 게임 파일. 브라우저가 presigned URL로 직접 업로드 (`lib/r2.ts`, `app/api/upload/`)
- 미들웨어는 Next 16 방식인 `proxy.ts`

## 확정된 규칙 (바꾸기 전에 사용자에게 확인)
- 모든 페이지 회원가입 필수. 예외: `/login`, `/auth/*`, `/copyright`(권리자 신고), `/legal/*`
- 만 14세 이상만 가입 (`profiles.age_confirmed`, `/onboarding`)
- 업로드: zip(index.html 필수) 또는 단일 HTML, 50MB, 하루 5개
- 검수: 자동 검사 통과 시 관리자 확인 없이 즉시 공개. 신고 3명 누적 시 자동 비공개
- 제재: 게임 삭제 1회 경고 → 2회 업로드 7일 정지 → 3회 영구 정지
- 저작권 신고: 저작권법 제103조 절차 (즉시 비공개 → 통보 → 30일 내 재게시 요청 → 예정일 통보 → 재게시)
- 수익: 광고만 (목록 사이 배너, 플레이 화면 옆/아래 배너). 게임을 가리는 광고 금지
- 콘텐츠: 전체이용가만
- 좋아요(유저당 1회), 대댓글 1단계, 별점 없음. 정렬: 인기순(최근 7일 플레이+좋아요)·최신순·좋아요순
- 플레이수: 같은 유저는 게임당 하루(한국 시간) 1회만
- 알림: 사이트 내 알림만 (이메일 없음)
- 리더보드: 게임이 `public/sdk.js`의 `GameSDK.submitScore()` 호출 → postMessage → 플레이 페이지 → `submit_score` RPC
- 공식 게임: 에이전트가 매일 1개 만들어 PR로 올리고, 소유자가 PR에서 검토·병합하면 공식 계정으로 업로드. 공식 계정 게임에는 '공식' 배지
- 동시 접속자 수: 게임 화면을 보고 있는 사람(30초 heartbeat, 75초 지나면 빠짐). 카드·게임 페이지·헤더에 표시
- 멀티: 누구나 업로드 때 '멀티 게임'으로 등록 가능, 한 방 2~8명, 빈자리 있는 방부터 채움. 플레이어끼리 자유 채팅 없음 (이모티콘 6개만). 메시지 2KB·1초 10개 제한

## 공식 게임 (에이전트 제작)
- 게임 파일: `games/<slug>/` (`index.html` 한 파일 + `game.json` + `thumbnail.png`). 규칙은 `games/README.md`, 뼈대는 `games/_template/`
- 루틴: `.claude/routines/game-studio.md` (매일 예약 작업). 에이전트: `.claude/agents/game-planner.md`, `game-developer.md`, `game-qa.md`
- 검사: `node scripts/check-game.mjs games/<slug>` — 실제 브라우저로 사이트와 같은 sandbox iframe에서 PC·휴대폰 크기로 켜봐요
- 업로드: main에 `games/**`가 합쳐지면 `.github/workflows/official-games.yml` → `scripts/publish-official-games.mjs`. 공식 계정 이메일·비밀번호로 로그인해서 일반 회원과 같은 RPC를 써요 (service_role 키 안 씀)
- 공식 표시: `profiles.is_official` (SQL Editor에서만 바꿈). 카드는 `published_games.uploader_is_official`
- 업로드 검사 패턴은 `scripts/lib/game-rules.mjs` 한 곳에서 관리해요 (워커·검사·업로드가 같이 씀)

## 접속자 수·멀티플레이
- DB: `live_players`(한 사람 한 줄), `game_rooms`, RPC `heartbeat` `leave_game` `join_room` `leave_room` `set_room_locked` `set_game_multiplayer` `site_live_count`, 뷰 `game_live_counts` (`supabase/migrations/20261109120000_multiplayer.sql`)
- 실시간: Supabase Realtime 비공개 채널 `room:<방 id>`. `realtime.messages` RLS로 그 방에 있는 사람만 듣고 보내요
- 게임 SDK: `public/sdk.js`의 `GameSDK.multi` (게임 템플릿에도 같은 코드). 중계: `lib/multiplayer.ts` (플레이 페이지). 로컬 미리보기·검사용 가짜 중계: `games/_preview/multi.html` — 메시지 규칙을 바꾸면 이 셋을 같이 고쳐요
- 게임 iframe에 보내는 postMessage는 sandbox(origin "null") 때문에 `"*"`로 보내요. 받는 쪽은 여전히 `event.source` 확인

## 코드 규칙
- 화면 문구는 한국어, 해요체.
- 상태를 바꾸는 DB 작업(업로드 등록, 플레이 기록, 점수, 관리자 처리)은 `supabase/migrations/`에 정의된 SECURITY DEFINER 함수(RPC)로 해요. 테이블 직접 쓰기는 좋아요·댓글·신고·프로필 일부 컬럼만 RLS로 허용돼 있어요.
- DB를 바꿀 땐 이미 있는 마이그레이션 파일을 고치지 말고 `supabase/migrations/<YYYYMMDDHHMMSS>_<설명>.sql` 새 파일을 추가해요. main에 push되면 GitHub Actions가 Supabase에 적용해요.
- 공개 게임 목록은 `published_games` 뷰를 써요 (카드에 필요한 컬럼은 `lib/constants.ts`의 `CARD_COLUMNS`).

## 보안 (꼭 지켜야 하는 것)
- 게임 iframe은 별도 도메인(`NEXT_PUBLIC_GAME_ORIGIN`)에서 `sandbox="allow-scripts allow-pointer-lock"`로만 실행. `allow-same-origin`을 절대 추가하지 않기.
- postMessage는 `event.source === iframe.contentWindow`인 것만 받기.
- `SUPABASE_SERVICE_ROLE_KEY`는 `scripts/review-worker.mjs`에서만. 화면 코드나 `NEXT_PUBLIC_` 변수에 넣지 않기.

## 실행
- `npm run dev` — 개발 서버
- `npm run worker` — 검사 대기 업로드 처리 (`-- --watch`로 계속)
- 설정 순서는 README.md
