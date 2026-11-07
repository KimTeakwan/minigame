# [사이트 이름] — AI 미니게임 플랫폼

AI로 만든 HTML 미니게임을 누구나 올리고, 회원들이 플레이·좋아요·댓글·리더보드로 즐기는 사이트예요.

- 화면: Next.js 16 (App Router) + Tailwind CSS
- DB·로그인: Supabase (이메일, 카카오, 구글)
- 게임 파일 저장: Cloudflare R2
- 자동 검수: `scripts/review-worker.mjs`

---

## 처음 실행하기

### 1. 패키지 설치

터미널에서 이 폴더로 이동한 뒤:

```bash
npm install
```

Node.js 20 이상이 필요해요 (`node -v`로 확인).

### 2. Supabase 프로젝트 만들기

1. https://supabase.com 에서 새 프로젝트를 만들어요 (지역은 Northeast Asia (Seoul) 추천). 이때 정한 **DB 비밀번호**를 적어둬요.
2. DB 테이블은 GitHub에 올리면 자동으로 만들어져요 (아래 "GitHub ↔ Supabase 연동"). 연동 없이 직접 만들려면
   **SQL Editor**에 `supabase/migrations/20261107000000_init.sql` 내용을 붙여 넣고 **Run** 해도 돼요. 둘 중 하나만 하세요.
3. **Project Settings > API**에서 아래 값을 복사해둬요.
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY` (비밀! 검수 워커만 써요)

### GitHub ↔ Supabase 연동 (DB 자동 반영)

`main` 브랜치에 `supabase/migrations/` 파일이 바뀌어 올라오면, GitHub Actions(`.github/workflows/supabase-deploy.yml`)가
Supabase 프로젝트에 자동으로 적용해요. 처음 한 번 아래 3개를 GitHub 저장소에 넣어주세요.

GitHub 저장소 > **Settings > Secrets and variables > Actions > New repository secret**

| 이름 | 값 |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens 에서 "Generate new token" |
| `SUPABASE_PROJECT_ID` | 프로젝트 주소 `https://<이 부분>.supabase.co` |
| `SUPABASE_DB_PASSWORD` | 프로젝트 만들 때 정한 DB 비밀번호 |

넣은 뒤 저장소의 **Actions** 탭 > "Supabase DB 배포" > **Run workflow**를 누르면 첫 테이블이 만들어져요.
초록 체크가 뜨면 Supabase **Table Editor**에서 games, profiles 같은 테이블이 보여요.

DB를 바꿀 땐 이미 적용된 파일을 고치지 말고 `supabase/migrations/`에 새 파일을 추가해요
(파일 이름은 `20261201000000_add_something.sql`처럼 날짜시간_설명).

### 3. 로그인 설정 (Supabase > Authentication)

- **URL Configuration**
  - Site URL: `http://localhost:3000` (배포 후엔 실제 주소)
  - Redirect URLs에 `http://localhost:3000/auth/callback` 추가
- **Providers**
  - Email: 켜져 있으면 돼요
  - Kakao: [Kakao Developers](https://developers.kakao.com)에서 앱을 만들고, REST API 키와 Client Secret을 넣어요.
    카카오 쪽 Redirect URI에는 `https://<프로젝트ID>.supabase.co/auth/v1/callback`을 등록해요.
    자세한 순서: https://supabase.com/docs/guides/auth/social-login/auth-kakao
  - Google: Google Cloud Console에서 OAuth 클라이언트를 만들고 같은 방식으로 넣어요.

### 4. Cloudflare R2 (게임 파일 저장소)

1. Cloudflare 대시보드 > R2에서 버킷을 만들어요 (예: `minigame-games`).
2. **R2 > Manage API Tokens**에서 "Object Read & Write" 토큰을 만들고 Account ID, Access Key ID, Secret Access Key를 복사해요.
3. 버킷 **Settings > Public access**에서 공개 주소를 연결해요.
   - 테스트할 땐 r2.dev 주소, 운영할 땐 `play.내도메인.com` 같은 **메인 사이트와 다른 도메인**을 연결하세요.
   - 이 주소가 `NEXT_PUBLIC_GAME_ORIGIN`이에요. 게임이 다른 도메인에서 돌아야 로그인 정보가 안전해요.
4. 버킷 **Settings > CORS policy**에 아래를 넣어요 (브라우저가 R2에 바로 업로드하기 때문이에요).

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://내도메인.com"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

### 5. 환경 변수

`.env.example`을 복사해서 `.env.local`로 이름을 바꾸고, 위에서 복사한 값을 채워요.

### 6. 실행

```bash
npm run dev
```

http://localhost:3000 을 열면 로그인 화면이 나와요. 가입하고 닉네임을 정하면 시작이에요.

### 7. 관리자 계정 만들기

가입한 뒤 Supabase SQL Editor에서:

```sql
update public.profiles set role = 'admin' where nickname = '내닉네임';
```

다시 접속하면 위쪽 메뉴에 "관리자"가 생겨요.

### 8. 게임 올려서 공개해보기

1. 사이트에서 "게임 올리기"로 zip(안에 index.html) 또는 HTML 파일을 올려요.
2. 터미널에서 검수 워커를 돌려요.

```bash
npm run worker            # 대기 중인 업로드를 한 번 처리
npm run worker -- --watch # 30초마다 계속 확인
```

3. 통과하면 홈의 "최신 게임"에 바로 올라와요. 실패하면 알림으로 사유가 가요.

---

## 폴더 구조

```
app/                   화면 (주소 = 폴더 이름)
  page.tsx             홈 (인기·최신 게임)
  games/[id]/          게임 플레이 페이지
  upload/              게임 올리기
  users/[nickname]/    업로더 프로필
  search/              검색·전체 목록 (인기순/최신순/좋아요순)
  notifications/       알림
  admin/               관리자 (신고·저작권 신고·유저·카테고리)
  copyright/           권리자 전용 저작권 침해 신고 (로그인 없이 접수)
  login/, onboarding/  가입·로그인, 닉네임·만 14세 확인
  api/upload/          업로드 주소 발급, 업로드 완료 처리
components/            화면 조각 (게임 카드, 헤더, 업로드 폼 등)
lib/                   Supabase·R2 연결, 상수
proxy.ts               로그인 안 한 사람을 로그인 화면으로 보내요
public/sdk.js          리더보드 SDK (게임 안에서 점수 보내기)
scripts/review-worker.mjs  자동 검수 워커
supabase/migrations/   DB 테이블·권한·함수 (GitHub에 올리면 자동 적용)
.github/workflows/     GitHub Actions (Supabase DB 자동 배포)
```

## 운영 규칙 숫자 바꾸기

| 규칙 | 지금 값 | 바꾸는 곳 |
| --- | --- | --- |
| 게임 파일 용량 | 50MB | `lib/constants.ts` |
| 하루 업로드 | 5개 | `lib/constants.ts` + DB 함수 `create_game_upload` |
| 신고 자동 비공개 | 서로 다른 3명 | DB 함수 `on_report_created` |
| 계정 제재 | 1회 경고 / 2회 7일 정지 / 3회 영구 | DB 함수 `apply_strike` |

DB 함수의 숫자를 바꿀 땐 `supabase/migrations/`에 새 파일을 만들고, 첫 마이그레이션에서 그 함수를 복사해
숫자만 고친 `create or replace function ...`을 넣어서 올리면 돼요.

---

## 아직 없는 것 (다음 단계)

- **실제 실행 테스트와 썸네일 자동 캡처**: 지금 워커는 파일·코드 검사만 해요. Playwright로 게임을 켜보고 화면을 캡처하는 단계를 `scripts/review-worker.mjs`의 `processOne`에 추가하면 돼요.
- **워커 상시 실행**: 지금은 내 컴퓨터에서 직접 돌려요. 운영할 땐 Railway·Fly.io 같은 곳에 올려서 `--watch`로 계속 돌려야 해요.
- **권리자에게 메일 보내기**: 저작권 신고 접수·재게시 예정일 통보 메일은 아직 직접 보내야 해요 (Resend 같은 메일 서비스를 붙일 자리).
- **버킷 분리**: 지금은 검사 전 파일(`uploads/`)도 같은 버킷에 있어서 주소를 알면 열릴 수 있어요. 운영 전에 업로드용(비공개)과 공개용 버킷을 나누세요.
- **광고**: `components/AdSlot.tsx` 자리에 애드센스 코드를 넣어요.
- **약관**: `app/legal/[slug]/page.tsx`의 이용약관·개인정보처리방침·콘텐츠 정책·신고 접수 담당자 내용. 특히 만 14세 확인과 저작권 신고 절차는 전문가 검토를 받으세요.
- **사이트 이름**: `[사이트 이름]`을 검색해서 바꿔요.

## 배포 (Vercel)

1. 이 폴더를 GitHub에 올리고 Vercel에서 import 해요.
2. Vercel 프로젝트 설정 > Environment Variables에 `.env.local`의 값을 넣어요 (`SUPABASE_SERVICE_ROLE_KEY`는 워커만 쓰니 넣지 않아도 돼요).
3. Supabase Site URL·Redirect URL, R2 CORS의 주소를 실제 도메인으로 바꿔요.
