import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import GameCard from "@/components/GameCard";
import AdSlot from "@/components/AdSlot";
import type { GameCardData } from "@/lib/types";
import { CARD_COLUMNS } from "@/lib/constants";

export default async function HomePage() {
  const supabase = await createClient();

  const [popularRes, latestRes, categoriesRes] = await Promise.all([
    supabase
      .from("published_games")
      .select(CARD_COLUMNS)
      .order("popular_score", { ascending: false })
      .order("like_count", { ascending: false })
      .limit(8),
    supabase.from("published_games").select(CARD_COLUMNS).order("created_at", { ascending: false }).limit(8),
    supabase.from("categories").select("id,name").order("sort_order"),
  ]);

  const popular = (popularRes.data ?? []) as GameCardData[];
  const latest = (latestRes.data ?? []) as GameCardData[];
  const categories = (categoriesRes.data ?? []) as { id: number; name: string }[];

  return (
    <div className="flex flex-col gap-10">
      <nav aria-label="카테고리" className="flex flex-wrap gap-2">
        <Link href="/search" className="inline-flex h-11 items-center rounded-full bg-ink px-[18px] font-bold text-white no-underline">
          전체
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/search?category=${c.id}`}
            className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-[18px] font-medium text-ink no-underline"
          >
            {c.name}
          </Link>
        ))}
      </nav>

      <section
        aria-labelledby="hero-title"
        className="flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-ink px-8 py-9 text-white"
      >
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-2.5">
          <h1 id="hero-title" className="m-0 font-display text-[38px] font-normal leading-tight">
            AI로 만든 미니게임, 올리고 같이 놀자
          </h1>
          <p className="m-0 text-base text-[#D6D5CF]">
            AI 코딩 툴로 만든 HTML 게임을 올리면 자동 검사를 거쳐 바로 누구나 플레이할 수 있어요.
          </p>
        </div>
        <Link href="/upload" className="inline-flex h-12 items-center rounded-full bg-white px-[22px] font-bold text-ink no-underline">
          게임 올리기
        </Link>
      </section>

      <GameSection title="인기 게임" subtitle="최근 7일 플레이수·좋아요 기준" moreHref="/search?sort=popular" games={popular} ranked />
      <AdSlot label="게임 목록 사이 배너 (예: 728×90)" />
      <GameSection title="최신 게임" subtitle="방금 올라온 게임" moreHref="/search?sort=latest" games={latest} />
    </div>
  );
}

function GameSection({
  title,
  subtitle,
  moreHref,
  games,
  ranked = false,
}: {
  title: string;
  subtitle: string;
  moreHref: string;
  games: GameCardData[];
  ranked?: boolean;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 className="m-0 text-[22px] font-black">{title}</h2>
          <span className="text-[13px] text-muted">{subtitle}</span>
        </div>
        <Link href={moreHref} className="text-sm font-medium">
          전체 보기
        </Link>
      </div>
      {games.length === 0 ? (
        <p className="m-0 rounded-xl border border-line bg-surface p-10 text-center text-muted">
          아직 올라온 게임이 없어요. 첫 게임을 올려보세요!
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5">
          {games.map((g, i) => (
            <GameCard key={g.id} game={g} rank={ranked ? i + 1 : undefined} />
          ))}
        </div>
      )}
    </section>
  );
}
