import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { REPORT_REASONS } from "@/lib/constants";
import { STATUS_LABELS, type GameStatus } from "@/lib/types";
import {
  addCategory,
  moveCategory,
  renameCategory,
  resolveCommentReports,
  resolveGameReports,
  setUserStatus,
  updateCopyrightClaim,
} from "./actions";

type SearchParams = Promise<{ tab?: string; u?: string }>;

const TABS = [
  { key: "dash", label: "대시보드" },
  { key: "reports", label: "신고 처리" },
  { key: "copyright", label: "저작권 신고" },
  { key: "users", label: "유저 관리" },
  { key: "categories", label: "카테고리 관리" },
];

const REASON_LABEL = Object.fromEntries(REPORT_REASONS.map((r) => [r.key, r.label])) as Record<string, string>;

const CLAIM_STATUS: Record<string, string> = {
  taken_down: "비공개 · 양쪽 통보 완료",
  restore_requested: "재게시 요청 받음",
  restore_scheduled: "재게시 예정",
  restored: "재게시 완료",
  closed: "종료",
};

const btn = "h-9 rounded-full border border-line-strong bg-surface px-3 text-[13px] font-medium";
const btnDanger = "h-9 rounded-full bg-danger px-3 text-[13px] font-bold text-white";
const th = "px-4 py-3 text-left font-bold";
const td = "px-4 py-3.5 align-top";

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  const { tab = "reports", u } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user?.id ?? "").maybeSingle();
  if (me?.role !== "admin") notFound();

  return (
    <div className="flex flex-wrap items-start gap-6">
      <nav aria-label="관리 메뉴" className="flex flex-[1_1_200px] flex-col gap-1 rounded-xl border border-line bg-surface p-3">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin?tab=${t.key}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-[10px] px-3.5 no-underline ${
              t.key === tab ? "bg-ink font-bold text-white" : "font-medium text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
        {tab === "dash" && <Dashboard />}
        {tab === "reports" && <Reports />}
        {tab === "copyright" && <Copyright />}
        {tab === "users" && <Users q={u} />}
        {tab === "categories" && <Categories />}
      </div>
    </div>
  );
}

async function Dashboard() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_stats");
  const s = (data ?? {}) as Record<string, number>;
  const tiles = [
    ["전체 가입자", s.users],
    ["오늘 올라온 게임", s.uploads_today],
    ["오늘 플레이", s.plays_today],
    ["처리 대기 신고", s.open_reports],
    ["처리 중 저작권 신고", s.open_claims],
  ] as const;
  return (
    <>
      <h1 className="m-0 text-[26px] font-black">대시보드</h1>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
        {tiles.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-[18px]">
            <span className="text-[13px] text-muted">{label}</span>
            <span className="text-[28px] font-black">{(value ?? 0).toLocaleString()}</span>
          </div>
        ))}
      </div>
      <p className="m-0 text-[13px] text-muted">일별 추이 차트는 데이터가 쌓이면 추가할 자리예요.</p>
    </>
  );
}

async function Reports() {
  const supabase = await createClient();
  const [{ data }, { count: flagged }] = await Promise.all([
    supabase
      .from("reports")
      .select(
        "id,target_type,reason,created_at,game_id,comment_id,game:games(id,title,status,uploader:profiles!games_uploader_id_fkey(nickname)),comment:comments(id,content,author:profiles!comments_user_id_fkey(nickname))",
      )
      .eq("status", "open")
      .order("created_at"),
    supabase.from("scores").select("id", { count: "exact", head: true }).eq("flagged", true),
  ]);

  // 같은 대상에 들어온 신고를 한 줄로 묶어요
  const groups = new Map<string, { kind: "game" | "comment"; id: string; title: string; who: string; status?: string; reasons: Set<string>; count: number }>();
  for (const r of (data ?? []) as any[]) {
    const key = r.target_type === "game" ? `g:${r.game_id}` : `c:${r.comment_id}`;
    const g =
      groups.get(key) ??
      (r.target_type === "game"
        ? { kind: "game" as const, id: r.game_id, title: r.game?.title ?? "(삭제된 게임)", who: r.game?.uploader?.nickname ?? "", status: r.game?.status, reasons: new Set<string>(), count: 0 }
        : { kind: "comment" as const, id: r.comment_id, title: r.comment?.content ?? "(삭제된 댓글)", who: r.comment?.author?.nickname ?? "", reasons: new Set<string>(), count: 0 });
    g.reasons.add(REASON_LABEL[r.reason] ?? r.reason);
    g.count += 1;
    groups.set(key, g);
  }
  const rows = [...groups.values()];

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="m-0 text-[26px] font-black">신고 처리</h1>
        <span className="text-sm text-muted">
          처리 대기 <strong className="text-ink">{rows.length}건</strong>
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="bg-ground text-body">
            <tr>
              <th scope="col" className={th}>대상</th>
              <th scope="col" className={th}>내용</th>
              <th scope="col" className={th}>신고 사유</th>
              <th scope="col" className={th}>신고 수</th>
              <th scope="col" className={th}>상태</th>
              <th scope="col" className={th}>처리</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">처리할 신고가 없어요</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={`${r.kind}-${r.id}`} className="border-t border-[#EFEEE8]">
                <td className={td}>{r.kind === "game" ? "게임" : "댓글"}</td>
                <td className={td}>
                  <span className="flex flex-col">
                    {r.kind === "game" ? (
                      <Link href={`/games/${r.id}`} className="font-bold">{r.title}</Link>
                    ) : (
                      <span className="font-bold">{r.title}</span>
                    )}
                    <span className="text-[13px] text-muted">{r.who}</span>
                  </span>
                </td>
                <td className={td}>{[...r.reasons].join(", ")}</td>
                <td className={td}>{r.count}</td>
                <td className={td}>{r.kind === "game" && r.status ? STATUS_LABELS[r.status as GameStatus] : "검토 대기"}</td>
                <td className={`${td} whitespace-nowrap`}>
                  <form action={r.kind === "game" ? resolveGameReports : resolveCommentReports} className="flex gap-1.5">
                    <input type="hidden" name={r.kind === "game" ? "gameId" : "commentId"} value={r.id} />
                    <button type="submit" name="remove" value="false" className={btn}>
                      {r.kind === "game" && r.status === "hidden" ? "복구" : "유지"}
                    </button>
                    <button type="submit" name="remove" value="true" className={btnDanger}>
                      삭제
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 text-[13px] text-muted">게임을 삭제하면 업로더 제재 횟수가 1 올라가요 (1회 경고 → 2회 업로드 7일 정지 → 3회 영구 정지).</p>
      <p className="m-0 rounded-xl border border-line bg-surface px-5 py-4 text-sm">
        비정상 리더보드 점수 <strong>{flagged ?? 0}건</strong> · Supabase 대시보드의 scores 테이블에서 flagged = true 인 줄을 검토하세요.
      </p>
    </>
  );
}

async function Copyright() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("copyright_claims")
    .select("id,claimant_name,claimant_email,work_description,evidence_url,status,restore_reason,restore_due_date,created_at,game:games(id,title)")
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as any[];

  return (
    <>
      <h1 className="m-0 text-[26px] font-black">저작권 신고</h1>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead className="bg-ground text-body">
            <tr>
              <th scope="col" className={th}>게임</th>
              <th scope="col" className={th}>권리자</th>
              <th scope="col" className={th}>내용</th>
              <th scope="col" className={th}>상태</th>
              <th scope="col" className={th}>다음 할 일</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">접수된 저작권 신고가 없어요</td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-[#EFEEE8]">
                <td className={td}>
                  <Link href={`/games/${c.game?.id}`} className="font-bold">{c.game?.title ?? "(삭제된 게임)"}</Link>
                  <div className="text-[13px] text-muted">{new Date(c.created_at).toLocaleDateString("ko-KR")} 접수</div>
                </td>
                <td className={td}>
                  {c.claimant_name}
                  <div className="text-[13px] text-muted">{c.claimant_email}</div>
                </td>
                <td className={td}>
                  {c.work_description}
                  {c.evidence_url && (
                    <div>
                      <a href={c.evidence_url} target="_blank" rel="noreferrer" className="text-[13px]">증빙 자료</a>
                    </div>
                  )}
                  {c.restore_reason && <div className="mt-1 text-[13px] text-body">업로더 소명: {c.restore_reason}</div>}
                </td>
                <td className={td}>
                  {CLAIM_STATUS[c.status]}
                  {c.restore_due_date && <div className="text-[13px] text-muted">예정일 {c.restore_due_date}</div>}
                </td>
                <td className={td}>
                  {c.status === "taken_down" && <span className="text-muted">업로더의 재게시 요청 기다리는 중 (통보일로부터 30일)</span>}
                  {c.status === "restore_requested" && (
                    <form action={updateCopyrightClaim} className="flex flex-col gap-1.5">
                      <input type="hidden" name="claimId" value={c.id} />
                      <input type="hidden" name="status" value="restore_scheduled" />
                      <label className="text-[13px]">
                        권리자에게 알린 재게시 예정일
                        <input type="date" name="due" required className="ml-2 h-9 rounded-md border border-line-strong px-2" />
                      </label>
                      <button type="submit" className={btn}>예정일 저장</button>
                    </form>
                  )}
                  {c.status === "restore_scheduled" && (
                    <div className="flex flex-wrap gap-1.5">
                      <form action={updateCopyrightClaim}>
                        <input type="hidden" name="claimId" value={c.id} />
                        <input type="hidden" name="status" value="restored" />
                        <button type="submit" className={btn}>재게시</button>
                      </form>
                      <form action={updateCopyrightClaim}>
                        <input type="hidden" name="claimId" value={c.id} />
                        <input type="hidden" name="status" value="closed" />
                        <button type="submit" className={btnDanger}>소송 통보 받음 · 종료</button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-5">
        <h2 className="m-0 text-base font-bold">처리 순서 (저작권법 제103조)</h2>
        <ol className="m-0 flex flex-col gap-1.5 pl-5 text-sm text-body">
          <li>접수되면 바로 비공개로 돌리고 권리자와 업로더에게 알려요 (업로더 알림은 자동, 권리자 메일은 직접 보내야 해요)</li>
          <li>업로더는 통보일로부터 30일 안에 정당한 권리를 소명하며 재게시를 요청할 수 있어요</li>
          <li>재게시 요청이 오면 요청 사실과 재게시 예정일을 권리자에게 알리고, 그날 다시 공개해요</li>
          <li>예정일 전에 권리자가 소송 제기를 알려오면 재게시하지 않아요</li>
        </ol>
      </section>
    </>
  );
}

async function Users({ q }: { q?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("profiles")
    .select("id,nickname,role,status,strike_count,suspended_until,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (q) query = query.ilike("nickname", `%${q.replace(/[%_]/g, "")}%`);
  const { data } = await query;
  const rows = (data ?? []) as any[];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-[26px] font-black">유저 관리</h1>
        <form action="/admin" className="flex items-center gap-2">
          <input type="hidden" name="tab" value="users" />
          <label htmlFor="user-search" className="sr-only">닉네임으로 찾기</label>
          <input id="user-search" name="u" defaultValue={q} placeholder="닉네임으로 찾기" className="h-11 rounded-full border border-line-strong bg-surface px-4 text-sm" />
          <button type="submit" className={btn}>찾기</button>
        </form>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="bg-ground text-body">
            <tr>
              <th scope="col" className={th}>닉네임</th>
              <th scope="col" className={th}>가입일</th>
              <th scope="col" className={th}>제재 횟수</th>
              <th scope="col" className={th}>상태</th>
              <th scope="col" className={th}>처리</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-[#EFEEE8]">
                <td className={`${td} font-bold`}>
                  {p.nickname ?? "(닉네임 미설정)"} {p.role === "admin" && <span className="text-[13px] text-muted">관리자</span>}
                </td>
                <td className={td}>{new Date(p.created_at).toLocaleDateString("ko-KR")}</td>
                <td className={td}>{p.strike_count}</td>
                <td className={td}>
                  {p.status === "active" ? "정상" : p.status === "banned" ? "이용 정지" : `업로드 정지 · ${p.suspended_until ? new Date(p.suspended_until).toLocaleDateString("ko-KR") : ""}까지`}
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  <form action={setUserStatus} className="flex gap-1.5">
                    <input type="hidden" name="userId" value={p.id} />
                    {p.status === "active" ? (
                      <>
                        <button type="submit" name="status" value="suspended" className={btn}>7일 업로드 정지</button>
                        <button type="submit" name="status" value="banned" className={btnDanger}>이용 정지</button>
                      </>
                    ) : (
                      <button type="submit" name="status" value="active" className={btn}>정지 해제</button>
                    )}
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 text-[13px] text-muted">이메일은 Supabase 대시보드 Authentication 메뉴에서 볼 수 있어요.</p>
    </>
  );
}

async function Categories() {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("id,name,sort_order").order("sort_order");
  const rows = (data ?? []) as { id: number; name: string }[];

  return (
    <>
      <h1 className="m-0 text-[26px] font-black">카테고리 관리</h1>
      <ul className="m-0 flex list-none flex-col overflow-hidden rounded-xl border border-line bg-surface p-0">
        {rows.map((c, i) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 border-b border-[#EFEEE8] px-4 py-3">
            <span className="w-6 text-[13px] text-muted">{i + 1}</span>
            <form action={renameCategory} className="flex flex-1 items-center gap-2">
              <input type="hidden" name="id" value={c.id} />
              <label htmlFor={`cat-${c.id}`} className="sr-only">카테고리 이름</label>
              <input id={`cat-${c.id}`} name="name" defaultValue={c.name} className="h-9 min-w-0 flex-1 rounded-md border border-line-strong px-2 font-bold" />
              <button type="submit" className={btn}>이름 저장</button>
            </form>
            <form action={moveCategory} className="flex gap-1">
              <input type="hidden" name="id" value={c.id} />
              <button type="submit" name="direction" value="up" aria-label={`${c.name} 위로`} className={btn}>↑</button>
              <button type="submit" name="direction" value="down" aria-label={`${c.name} 아래로`} className={btn}>↓</button>
            </form>
          </li>
        ))}
      </ul>
      <form action={addCategory} className="flex gap-2">
        <label htmlFor="new-category" className="sr-only">새 카테고리 이름</label>
        <input id="new-category" name="name" placeholder="새 카테고리 이름" className="h-11 rounded-full border border-line-strong bg-surface px-4 text-sm" />
        <button type="submit" className="h-11 rounded-full bg-ink px-[18px] text-sm font-bold text-white">카테고리 추가</button>
      </form>
    </>
  );
}
