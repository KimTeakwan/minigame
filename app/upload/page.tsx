import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UploadForm from "@/components/upload/UploadForm";
import { DAILY_UPLOAD_LIMIT } from "@/lib/constants";

type SearchParams = Promise<{ game?: string }>;

// 한국 시간 기준 오늘 0시
function startOfTodayKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 60 * 60 * 1000).toISOString();
}

export default async function UploadPage({ searchParams }: { searchParams: SearchParams }) {
  const { game: gameId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/upload");

  const [profileRes, categoriesRes, todayRes, gameRes] = await Promise.all([
    supabase.from("profiles").select("nickname,status,suspended_until").eq("id", user.id).single(),
    supabase.from("categories").select("id,name").order("sort_order"),
    supabase
      .from("game_versions")
      .select("id, games!inner(uploader_id)", { count: "exact", head: true })
      .eq("games.uploader_id", user.id)
      .gte("created_at", startOfTodayKST()),
    gameId
      ? supabase
          .from("games")
          .select("id,title,description,howto,category_id,tags,controls,ai_tool,leaderboard_enabled,score_order,multiplayer,max_players")
          .eq("id", gameId)
          .eq("uploader_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const profile = profileRes.data;
  const suspended =
    profile?.status === "banned" ||
    (profile?.status === "suspended" && profile.suspended_until && new Date(profile.suspended_until) > new Date());
  const todayCount = todayRes.count ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[28px] font-black">{gameRes.data ? "새 버전 올리기" : "게임 올리기"}</h1>
          <p className="m-0 text-muted">AI로 만든 HTML 게임을 올리면 자동 검사를 통과하는 대로 바로 공개돼요.</p>
        </div>
        <span className="inline-flex h-9 items-center rounded-full border border-line bg-surface px-3.5 text-[13px] text-body">
          오늘 올린 게임
          <strong className="ml-1.5 text-ink">
            {todayCount} / {DAILY_UPLOAD_LIMIT}
          </strong>
        </span>
      </div>

      {suspended ? (
        <p className="m-0 rounded-xl border border-line bg-surface p-10 text-center text-body">
          {profile?.status === "banned"
            ? "이용이 정지된 계정이라 게임을 올릴 수 없어요."
            : `업로드가 정지된 상태예요. ${new Date(profile!.suspended_until!).toLocaleDateString("ko-KR")}부터 다시 올릴 수 있어요.`}
        </p>
      ) : todayCount >= DAILY_UPLOAD_LIMIT ? (
        <p className="m-0 rounded-xl border border-line bg-surface p-10 text-center text-body">
          오늘은 {DAILY_UPLOAD_LIMIT}개를 모두 올렸어요. 내일 다시 올려주세요.
        </p>
      ) : (
        <UploadForm
          categories={(categoriesRes.data ?? []) as { id: number; name: string }[]}
          existing={gameRes.data ?? null}
          nickname={profile?.nickname ?? ""}
          siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? ""}
        />
      )}
    </div>
  );
}
