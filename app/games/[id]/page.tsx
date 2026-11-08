import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdSlot from "@/components/AdSlot";
import OfficialBadge from "@/components/OfficialBadge";
import GamePlayer from "@/components/game/GamePlayer";
import CommentsAndBoard, { type CommentRow } from "@/components/game/CommentsAndBoard";
import { CARD_COLUMNS, CONTROL_LABELS, aiToolLabel, gameFileUrl } from "@/lib/constants";
import { STATUS_LABELS, type GameCardData, type GameStatus } from "@/lib/types";

type Params = Promise<{ id: string }>;

export default async function GamePage({ params }: { params: Params }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: game } = await supabase
    .from("games")
    .select(
      "id,title,description,howto,tags,controls,ai_tool,status,reject_reason,storage_path,leaderboard_enabled,score_order,play_count,like_count,created_at,uploader_id,category_id,category:categories(name),uploader:profiles!games_uploader_id_fkey(nickname,is_official)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!game || game.status === "deleted") notFound();

  // DB 타입을 생성하지 않아서 supabase-js가 연결된 줄을 배열로 추정해요. 실제로는 객체 하나가 와요.
  const uploader = game.uploader as unknown as { nickname: string | null; is_official: boolean } | null;
  const category = game.category as unknown as { name: string } | null;
  const uploaderNickname: string = uploader?.nickname ?? "알 수 없음";
  const categoryName: string | null = category?.name ?? null;
  const isPublished = game.status === "published" && !!game.storage_path;

  const [likedRes, commentsRes, sameCategoryRes, sameUploaderRes] = await Promise.all([
    user
      ? supabase.from("likes").select("game_id").eq("game_id", id).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("comments")
      .select("id,content,created_at,parent_id,user_id,author:profiles!comments_user_id_fkey(nickname)")
      .eq("game_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("published_games")
      .select(CARD_COLUMNS)
      .eq("category_id", game.category_id)
      .neq("id", id)
      .order("popular_score", { ascending: false })
      .limit(3),
    supabase
      .from("published_games")
      .select(CARD_COLUMNS)
      .eq("uploader_id", game.uploader_id)
      .neq("id", id)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const comments = (commentsRes.data ?? []).map((c: any) => ({
    id: c.id,
    content: c.content,
    created_at: c.created_at,
    parent_id: c.parent_id,
    user_id: c.user_id,
    nickname: c.author?.nickname ?? "알 수 없음",
  })) as CommentRow[];

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="현재 위치" className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
        <Link href="/" className="text-muted">
          홈
        </Link>
        <span aria-hidden="true">›</span>
        {categoryName && (
          <>
            <Link href={`/search?category=${game.category_id}`} className="text-muted">
              {categoryName}
            </Link>
            <span aria-hidden="true">›</span>
          </>
        )}
        <span aria-current="page" className="text-ink">
          {game.title}
        </span>
      </nav>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-5">
          {isPublished ? (
            <GamePlayer
              gameId={game.id}
              title={game.title}
              src={gameFileUrl(game.storage_path!)}
              leaderboardEnabled={game.leaderboard_enabled}
              initialLiked={!!likedRes.data}
              initialLikeCount={game.like_count}
            />
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-2xl bg-ink p-6 text-center text-[#D6D5CF]">
              <span className="text-lg font-bold text-white">{STATUS_LABELS[game.status as GameStatus]}</span>
              {game.status === "rejected" && game.reject_reason && <span>사유: {game.reject_reason}</span>}
              {(game.status === "pending" || game.status === "uploading") && <span>자동 검사가 끝나면 바로 공개돼요.</span>}
              {game.status === "hidden_copyright" && (
                <Link href="/notifications?type=system" className="text-white underline">
                  알림에서 재게시 요청하기
                </Link>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <h1 className="m-0 text-[28px] font-black leading-snug">{game.title}</h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
              <Link
                href={`/users/${encodeURIComponent(uploaderNickname)}`}
                className="inline-flex items-center gap-2 font-bold text-ink no-underline"
              >
                <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#DCE8FB] text-[13px] text-[#1E40AF]">
                  {uploaderNickname.charAt(0)}
                </span>
                {uploaderNickname}
                {uploader?.is_official && <OfficialBadge />}
              </Link>
              <span>플레이 {game.play_count.toLocaleString()}회</span>
              <span>좋아요 {game.like_count.toLocaleString()}</span>
              <span>{new Date(game.created_at).toLocaleDateString("ko-KR")} 업로드</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categoryName && (
                <Link
                  href={`/search?category=${game.category_id}`}
                  className="inline-flex h-8 items-center rounded-full bg-ink px-3 text-[13px] font-medium text-white no-underline"
                >
                  {categoryName}
                </Link>
              )}
              {(game.tags as string[]).map((t) => (
                <Link
                  key={t}
                  href={`/search?q=${encodeURIComponent(t)}`}
                  className="inline-flex h-8 items-center rounded-full border border-line bg-surface px-3 text-[13px] text-ink no-underline"
                >
                  #{t}
                </Link>
              ))}
              <span className="inline-flex h-8 items-center rounded-full bg-chip px-3 text-[13px] text-body">
                {CONTROL_LABELS[game.controls]} 지원
              </span>
              {game.ai_tool && (
                <span className="inline-flex h-8 items-center rounded-full bg-accent-soft px-3 text-[13px] font-medium text-accent-ink">
                  {aiToolLabel(game.ai_tool)}
                </span>
              )}
            </div>
          </div>

          <section aria-labelledby="about-title" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-5">
            <h2 id="about-title" className="m-0 text-lg font-bold">
              게임 설명
            </h2>
            <p className="m-0 whitespace-pre-line text-body">{game.description || "설명이 없어요."}</p>
            {game.howto && (
              <>
                <h3 className="m-0 mt-2 text-[15px] font-bold">조작법</h3>
                <p className="m-0 whitespace-pre-line text-body">{game.howto}</p>
              </>
            )}
          </section>

          {isPublished && (
            <CommentsAndBoard
              gameId={game.id}
              uploaderId={game.uploader_id}
              meId={user?.id ?? null}
              comments={comments}
              leaderboardEnabled={game.leaderboard_enabled}
              scoreOrder={game.score_order}
            />
          )}
        </div>

        <aside aria-label="광고와 관련 게임" className="flex min-w-0 flex-[1_1_300px] flex-col gap-6">
          <AdSlot label="게임 옆 배너 (예: 300×250) · 모바일에서는 게임 아래" minHeight={250} />
          <RelatedList title="같은 카테고리 게임" games={(sameCategoryRes.data ?? []) as GameCardData[]} />
          <RelatedList title={`${uploaderNickname}의 다른 게임`} games={(sameUploaderRes.data ?? []) as GameCardData[]} />
        </aside>
      </div>
    </div>
  );
}

function RelatedList({ title, games }: { title: string; games: GameCardData[] }) {
  if (games.length === 0) return null;
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="m-0 text-base font-bold">{title}</h2>
      {games.map((g) => (
        <Link
          key={g.id}
          href={`/games/${g.id}`}
          className="flex items-center gap-3 rounded-[10px] border border-line bg-surface p-2 text-ink no-underline"
        >
          <span aria-hidden="true" className="flex h-[54px] w-[72px] flex-none items-center justify-center rounded-lg bg-accent-soft font-display text-[26px] text-accent-ink">
            {g.title.charAt(0)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-bold">{g.title}</span>
            <span className="text-xs text-muted">
              {g.uploader_nickname} · 좋아요 {g.like_count.toLocaleString()}
            </span>
          </span>
        </Link>
      ))}
    </section>
  );
}
