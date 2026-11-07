import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import GameCard from "@/components/GameCard";
import AdSlot from "@/components/AdSlot";
import SortTabs, { parseSort, sortColumn } from "@/components/SortTabs";
import { CARD_COLUMNS, type SortKey } from "@/lib/constants";
import type { GameCardData } from "@/lib/types";

const PAGE_SIZE = 24;

type SearchParams = Promise<{ q?: string; category?: string; sort?: string; page?: string }>;

// PostgREST 필터 문법을 깨뜨리는 문자를 빼요
function cleanQuery(q: string | undefined) {
  return (q ?? "").replace(/[,(){}"*%\\]/g, " ").trim().slice(0, 40);
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = cleanQuery(params.q);
  const categoryId = params.category ? Number(params.category) : null;
  const sort = parseSort(params.sort);
  const page = Math.max(1, Number(params.page) || 1);
  const limit = PAGE_SIZE * page;

  const supabase = await createClient();

  let query = supabase.from("published_games").select(CARD_COLUMNS);
  if (q) {
    query = query.or(`title.ilike.*${q}*,uploader_nickname.ilike.*${q}*,tags.cs.{"${q}"}`);
  }
  if (categoryId) query = query.eq("category_id", categoryId);
  query = query.order(sortColumn(sort), { ascending: false }).order("created_at", { ascending: false }).limit(limit);

  const [gamesRes, categoriesRes, usersRes] = await Promise.all([
    query,
    supabase.from("categories").select("id,name").order("sort_order"),
    q
      ? supabase.from("profiles").select("nickname").ilike("nickname", `%${q}%`).not("nickname", "is", null).limit(4)
      : Promise.resolve({ data: [] as { nickname: string }[] }),
  ]);

  const games = (gamesRes.data ?? []) as GameCardData[];
  const categories = (categoriesRes.data ?? []) as { id: number; name: string }[];
  const users = (usersRes.data ?? []) as { nickname: string }[];
  const hasMore = games.length === limit;

  function href(next: { category?: number | null; sort?: SortKey; page?: number }) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    const cat = next.category === undefined ? categoryId : next.category;
    if (cat) sp.set("category", String(cat));
    sp.set("sort", next.sort ?? sort);
    if (next.page && next.page > 1) sp.set("page", String(next.page));
    return `/search?${sp.toString()}`;
  }

  function matchBadge(g: GameCardData) {
    if (!q) return undefined;
    const lower = q.toLowerCase();
    if (g.title.toLowerCase().includes(lower)) return "제목 일치";
    if (g.tags.some((t) => t.toLowerCase() === lower)) return `태그 #${q}`;
    return "업로더 닉네임 일치";
  }

  const firstRow = games.slice(0, 8);
  const rest = games.slice(8);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="m-0 text-[26px] font-black">{q ? `'${q}' 검색 결과` : "전체 게임"}</h1>
        {q && <span className="text-sm text-muted">제목·태그·업로더 닉네임에서 찾았어요</span>}
      </div>

      <div className="flex flex-col gap-3 border-b border-line pb-5">
        <nav aria-label="카테고리로 좁히기" className="flex flex-wrap gap-2">
          <CategoryChip href={href({ category: null, page: 1 })} on={!categoryId} label="전체" />
          {categories.map((c) => (
            <CategoryChip key={c.id} href={href({ category: c.id, page: 1 })} on={categoryId === c.id} label={c.name} />
          ))}
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-body">
            게임 <strong className="text-ink">{games.length}{hasMore ? "+" : ""}개</strong>
          </span>
          <SortTabs current={sort} makeHref={(s) => href({ sort: s, page: 1 })} />
        </div>
      </div>

      {users.length > 0 && (
        <section aria-labelledby="users-title" className="flex flex-col gap-2.5">
          <h2 id="users-title" className="m-0 text-base font-bold">
            업로더
          </h2>
          <div className="flex flex-wrap gap-3">
            {users.map((u) => (
              <Link
                key={u.nickname}
                href={`/users/${encodeURIComponent(u.nickname)}`}
                className="flex min-w-60 items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-ink no-underline"
              >
                <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#DCE8FB] font-bold text-[#1E40AF]">
                  {u.nickname.charAt(0)}
                </span>
                <span className="font-bold">{u.nickname}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {games.length === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-6 py-14 text-center">
          <h2 className="m-0 text-xl font-bold">{q ? `'${q}'에 맞는 게임이 없어요` : "이 카테고리에는 아직 게임이 없어요"}</h2>
          <p className="m-0 text-muted">다른 검색어를 써보거나, 없는 게임이라면 직접 만들어서 올려보세요.</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Link href="/" className="inline-flex h-11 items-center rounded-full border border-line-strong bg-surface px-5 font-medium text-ink no-underline">
              인기 게임 보기
            </Link>
            <Link href="/upload" className="inline-flex h-11 items-center rounded-full bg-accent px-5 font-bold text-white no-underline">
              게임 올리기
            </Link>
          </div>
        </section>
      ) : (
        <section aria-label="게임 목록" className="flex flex-col gap-5">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5">
            {firstRow.map((g) => (
              <GameCard key={g.id} game={g} badge={matchBadge(g)} />
            ))}
          </div>
          <AdSlot label="게임 목록 사이 배너 (예: 728×90)" />
          {rest.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5">
              {rest.map((g) => (
                <GameCard key={g.id} game={g} badge={matchBadge(g)} />
              ))}
            </div>
          )}
          {hasMore && (
            <div className="flex justify-center">
              <Link
                href={href({ page: page + 1 })}
                scroll={false}
                className="inline-flex h-12 items-center rounded-full border border-line-strong bg-surface px-7 font-bold text-ink no-underline"
              >
                결과 더 보기
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function CategoryChip({ href, on, label }: { href: string; on: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={on ? "true" : undefined}
      className={`inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium no-underline ${
        on ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink"
      }`}
    >
      {label}
    </Link>
  );
}
