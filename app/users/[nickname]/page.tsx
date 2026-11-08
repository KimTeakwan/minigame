import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import GameCard from "@/components/GameCard";
import OfficialBadge from "@/components/OfficialBadge";
import SortTabs, { parseSort } from "@/components/SortTabs";
import ProfileEditor from "@/components/profile/ProfileEditor";
import { CARD_COLUMNS, CONTROL_LABELS, type SortKey } from "@/lib/constants";
import { STATUS_LABELS, type GameCardData, type GameStatus } from "@/lib/types";

type Params = Promise<{ nickname: string }>;
type SearchParams = Promise<{ sort?: string }>;

type OwnGame = {
  id: string;
  title: string;
  status: GameStatus;
  reject_reason: string | null;
  controls: string;
  leaderboard_enabled: boolean;
  play_count: number;
  like_count: number;
  created_at: string;
  category: { name: string } | null;
};

async function deleteGame(formData: FormData) {
  "use server";
  const supabase = await createClient();
  await supabase.rpc("delete_my_game", { p_game_id: String(formData.get("gameId")) });
  revalidatePath("/users/[nickname]", "page");
}

export default async function ProfilePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { nickname: raw } = await params;
  const nickname = decodeURIComponent(raw);
  const sort = parseSort((await searchParams).sort);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,nickname,bio,created_at,status,strike_count,suspended_until,is_official")
    .eq("nickname", nickname)
    .maybeSingle();
  if (!profile) notFound();

  const isOwner = user?.id === profile.id;
  const sortCol = sort === "latest" ? "created_at" : sort === "likes" ? "like_count" : "play_count";

  const [publicRes, ownRes] = await Promise.all([
    supabase
      .from("published_games")
      .select(CARD_COLUMNS)
      .eq("uploader_id", profile.id)
      .order(sort === "popular" ? "popular_score" : sortCol, { ascending: false }),
    isOwner
      ? supabase
          .from("games")
          .select("id,title,status,reject_reason,controls,leaderboard_enabled,play_count,like_count,created_at,category:categories(name)")
          .eq("uploader_id", profile.id)
          .neq("status", "published")
          .neq("status", "deleted")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const games = (publicRes.data ?? []) as GameCardData[];
  const hiddenGames = (ownRes.data ?? []) as unknown as OwnGame[];
  const totalPlays = games.reduce((sum, g) => sum + g.play_count, 0);
  const sortHref = (s: SortKey) => `/users/${encodeURIComponent(nickname)}?sort=${s}`;

  const statusLine =
    profile.status === "banned"
      ? { label: "이용 정지", tone: "bg-accent-soft text-accent-ink" }
      : profile.status === "suspended" && profile.suspended_until && new Date(profile.suspended_until) > new Date()
        ? { label: `업로드 정지 · ${new Date(profile.suspended_until).toLocaleDateString("ko-KR")}까지`, tone: "bg-accent-soft text-accent-ink" }
        : profile.strike_count > 0
          ? { label: `경고 ${profile.strike_count}회`, tone: "bg-[#FFF0C2] text-[#854D0E]" }
          : { label: "정상", tone: "bg-[#DDF1DA] text-[#166534]" };

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-wrap items-center gap-6 rounded-2xl border border-line bg-surface p-7">
        <span aria-hidden="true" className="flex h-24 w-24 flex-none items-center justify-center rounded-full bg-[#DCE8FB] font-display text-[40px] text-[#1E40AF]">
          {profile.nickname.charAt(0)}
        </span>
        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-2">
          <h1 className="m-0 flex flex-wrap items-center gap-2 text-[28px] font-black leading-snug">
            {profile.nickname}
            {profile.is_official && <OfficialBadge />}
          </h1>
          <p className="m-0 whitespace-pre-line text-body">{profile.bio || "자기소개가 아직 없어요."}</p>
          <div className="flex flex-wrap gap-5 text-sm text-muted">
            <span>
              올린 게임 <strong className="text-ink">{games.length}개</strong>
            </span>
            <span>
              총 플레이 <strong className="text-ink">{totalPlays.toLocaleString()}회</strong>
            </span>
            <span>{new Date(profile.created_at).toLocaleDateString("ko-KR")} 가입</span>
          </div>
        </div>
        {isOwner && (
          <div className="flex flex-wrap gap-2">
            <ProfileEditor nickname={profile.nickname} bio={profile.bio ?? ""} />
            <Link href="/upload" className="inline-flex h-11 items-center rounded-full bg-ink px-[18px] text-sm font-bold text-white no-underline">
              새 게임 올리기
            </Link>
          </div>
        )}
      </section>

      {isOwner && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-5 py-3.5 text-sm">
          <span className="inline-flex items-center gap-2">
            계정 상태 <span className={`rounded-full px-2.5 py-0.5 font-bold ${statusLine.tone}`}>{statusLine.label}</span>
          </span>
          <span className="text-[13px] text-muted">이 줄은 본인에게만 보여요</span>
        </div>
      )}

      {isOwner && hiddenGames.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-lg font-bold">공개되지 않은 내 게임</h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {hiddenGames.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent-ink">{STATUS_LABELS[g.status]}</span>
                <Link href={`/games/${g.id}`} className="font-bold">
                  {g.title}
                </Link>
                <span className="text-[13px] text-muted">
                  {g.category?.name} · {CONTROL_LABELS[g.controls]}
                  {g.reject_reason ? ` · 사유: ${g.reject_reason}` : ""}
                </span>
                <span className="ml-auto flex gap-1.5">
                  <Link href={`/upload?game=${g.id}`} className="inline-flex h-9 items-center rounded-full border border-line-strong px-3 text-[13px] font-medium no-underline">
                    새 버전 올리기
                  </Link>
                  <DeleteButton gameId={g.id} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-[22px] font-black">올린 게임</h2>
          <SortTabs current={sort} makeHref={sortHref} />
        </div>
        {games.length === 0 ? (
          <p className="m-0 rounded-xl border border-line bg-surface p-10 text-center text-muted">아직 공개된 게임이 없어요.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5">
            {games.map((g) => (
              <div key={g.id} className="flex flex-col gap-2">
                <GameCard game={g} />
                {isOwner && (
                  <div className="flex flex-wrap gap-1.5">
                    <Link href={`/upload?game=${g.id}`} className="inline-flex h-9 items-center rounded-full border border-line-strong bg-surface px-3 text-[13px] font-medium no-underline">
                      새 버전 올리기
                    </Link>
                    <DeleteButton gameId={g.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DeleteButton({ gameId }: { gameId: string }) {
  return (
    <form action={deleteGame}>
      <input type="hidden" name="gameId" value={gameId} />
      <button type="submit" className="h-9 rounded-full border border-line-strong bg-surface px-3 text-[13px] font-medium text-danger">
        삭제
      </button>
    </form>
  );
}
