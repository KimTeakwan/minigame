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
