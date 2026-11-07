import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import RestoreRequest from "@/components/notifications/RestoreRequest";

type SearchParams = Promise<{ type?: string }>;

type Row = {
  id: string;
  type: string;
  message: string | null;
  count: number;
  is_read: boolean;
  created_at: string;
  game_id: string | null;
  claim_id: string | null;
  actor: { nickname: string | null } | null;
  game: { title: string } | null;
  comment: { content: string } | null;
};

const FILTERS = [
  { key: "all", label: "전체", types: null },
  { key: "comment", label: "댓글·답글", types: ["comment", "reply"] },
  { key: "like", label: "좋아요", types: ["like"] },
  {
    key: "system",
    label: "운영 알림",
    types: ["review_passed", "review_failed", "hidden_by_reports", "game_restored", "game_removed", "strike", "copyright_takedown", "copyright_restored"],
  },
];

async function markAllRead() {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}

function describe(n: Row): { strong: string; text: string } {
  const who = n.actor?.nickname ?? "누군가";
  const game = n.game?.title ?? "게임";
  switch (n.type) {
    case "comment":
      return { strong: who, text: ` 님이 ${game}에 댓글을 남겼어요.` };
    case "reply":
      return { strong: who, text: " 님이 내 댓글에 답글을 남겼어요." };
    case "like":
      return { strong: n.count > 1 ? `${who} 님 외 ${n.count - 1}명` : who, text: `이 ${game}을(를) 좋아해요.` };
    case "review_passed":
      return { strong: game, text: "이(가) 검사를 통과해 공개됐어요." };
    case "review_failed":
      return { strong: game, text: `이(가) 자동 검사를 통과하지 못했어요.${n.message ? ` 사유: ${n.message}` : ""}` };
    case "hidden_by_reports":
      return { strong: game, text: "이(가) 신고 누적으로 비공개됐어요. 관리자가 확인한 뒤 결과를 알려드려요." };
    case "game_restored":
      return { strong: game, text: "이(가) 검토 후 다시 공개됐어요." };
    case "game_removed":
      return { strong: game, text: "이(가) 검토 결과 삭제됐어요." };
    case "copyright_takedown":
      return {
        strong: game,
        text: "에 저작권 침해 신고가 접수되어 비공개됐어요. 정당한 권리가 있다면 통보일로부터 30일 안에 재게시를 요청할 수 있어요.",
      };
    case "copyright_restored":
      return { strong: game, text: "이(가) 저작권 신고 처리 후 다시 공개됐어요." };
    case "strike":
      return { strong: "계정 제재", text: ` · ${n.message ?? ""}` };
    default:
      return { strong: "", text: n.message ?? "" };
  }
}

export default async function NotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  const { type } = await searchParams;
  const filter = FILTERS.find((f) => f.key === type) ?? FILTERS[0];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/notifications");

  let query = supabase
    .from("notifications")
    .select(
      "id,type,message,count,is_read,created_at,game_id,claim_id,actor:profiles!notifications_actor_id_fkey(nickname),game:games(title),comment:comments(content)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (filter.types) query = query.in("type", filter.types);

  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-[28px] font-black">알림</h1>
        <form action={markAllRead}>
          <button type="submit" className="h-10 rounded-full border border-line-strong bg-surface px-4 text-sm font-medium">
            모두 읽음으로 표시
          </button>
        </form>
      </div>

      <div role="group" aria-label="알림 종류" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/notifications" : `/notifications?type=${f.key}`}
            aria-current={f.key === filter.key ? "true" : undefined}
            className={`inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium no-underline ${
              f.key === filter.key ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="m-0 rounded-xl border border-line bg-surface p-12 text-center text-muted">이 종류의 알림이 없어요.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col overflow-hidden rounded-xl border border-line bg-surface p-0">
          {rows.map((n) => {
            const { strong, text } = describe(n);
            return (
              <li key={n.id} className={`flex gap-3.5 border-b border-[#EFEEE8] px-[18px] py-4 ${n.is_read ? "" : "bg-[#FFF7F1]"}`}>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <p className="m-0">
                    <strong>{strong}</strong>
                    {text}
                  </p>
                  {n.comment?.content && (n.type === "comment" || n.type === "reply") && (
                    <p className="m-0 rounded-lg bg-ground px-3 py-2 text-sm text-body">{n.comment.content}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {n.game_id && (
                      <Link href={`/games/${n.game_id}`} className="inline-flex h-9 items-center rounded-full border border-line-strong bg-surface px-3.5 text-[13px] font-medium text-ink no-underline">
                        게임 보기
                      </Link>
                    )}
                    {n.type === "review_failed" && n.game_id && (
                      <Link href={`/upload?game=${n.game_id}`} className="inline-flex h-9 items-center rounded-full bg-ink px-3.5 text-[13px] font-bold text-white no-underline">
                        다시 올리기
                      </Link>
                    )}
                  </div>
                  {n.type === "copyright_takedown" && n.claim_id && <RestoreRequest claimId={n.claim_id} />}
                  <span className="text-[13px] text-muted">{new Date(n.created_at).toLocaleString("ko-KR")}</span>
                </div>
                {!n.is_read && (
                  <span className="mt-2 h-2 w-2 flex-none rounded-full bg-accent-bright">
                    <span className="sr-only">읽지 않음</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
