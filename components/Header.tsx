import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let nickname: string | null = null;
  let isAdmin = false;
  let hasUnread = false;
  let liveCount = 0;

  if (user) {
    const [{ data: profile }, { count }, { data: live }] = await Promise.all([
      supabase.from("profiles").select("nickname, role").eq("id", user.id).maybeSingle(),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false),
      supabase.rpc("site_live_count"), // 지금 게임 화면을 보고 있는 사람 수 (최근 75초)
    ]);
    nickname = profile?.nickname ?? null;
    isAdmin = profile?.role === "admin";
    hasUnread = (count ?? 0) > 0;
    liveCount = typeof live === "number" ? live : 0;
  }

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1248px] flex-wrap items-center gap-4 px-6 py-3">
        <Link href="/" className="font-display text-[26px] leading-none text-ink no-underline">
          [사이트 이름]
        </Link>
        {user && liveCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#15803d]">
            <span className="h-2 w-2 rounded-full bg-[#22c55e]" aria-hidden="true" />
            지금 {liveCount.toLocaleString()}명 플레이 중
          </span>
        )}

        {user && (
          <form
            action="/search"
            role="search"
            className="flex h-11 min-w-0 flex-[1_1_320px] items-center gap-2 rounded-full border border-line bg-chip pl-4 pr-1"
          >
            <label htmlFor="site-search" className="sr-only">
              게임 검색
            </label>
            <input
              id="site-search"
              name="q"
              type="search"
              placeholder="게임 제목, 태그, 닉네임으로 검색"
              className="h-9 min-w-0 flex-1 bg-transparent text-[15px] outline-none"
            />
            <button
              type="submit"
              aria-label="검색"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-ink text-white"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            </button>
          </form>
        )}

        {user && (
          <nav className="flex items-center gap-2" aria-label="내 메뉴">
            {isAdmin && (
              <Link href="/admin" className="rounded-full px-3 py-2 text-sm font-medium text-muted">
                관리자
              </Link>
            )}
            <Link
              href="/upload"
              className="inline-flex h-11 items-center gap-1.5 rounded-full bg-accent px-[18px] font-bold text-white no-underline"
            >
              + 게임 올리기
            </Link>
            <Link
              href="/notifications"
              aria-label={hasUnread ? "알림 (읽지 않은 알림 있음)" : "알림"}
              className="relative flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-ink"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
              </svg>
              {hasUnread && <span aria-hidden="true" className="absolute right-2.5 top-2 h-2 w-2 rounded-full bg-accent-bright" />}
            </Link>
            {nickname && (
              <Link
                href={`/users/${encodeURIComponent(nickname)}`}
                aria-label="내 프로필"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft font-bold text-accent-ink no-underline"
              >
                {nickname.charAt(0)}
              </Link>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
