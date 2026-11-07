"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type CommentRow = {
  id: string;
  content: string;
  created_at: string;
  parent_id: string | null;
  user_id: string;
  nickname: string;
};

type BoardRow = { rank: number; nickname: string; best_score: number; is_me: boolean };

type Props = {
  gameId: string;
  uploaderId: string;
  meId: string | null;
  comments: CommentRow[];
  leaderboardEnabled: boolean;
  scoreOrder: "asc" | "desc";
};

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

export default function CommentsAndBoard({ gameId, uploaderId, meId, comments, leaderboardEnabled, scoreOrder }: Props) {
  const [tab, setTab] = useState<"comments" | "board">("comments");
  const topLevel = comments.filter((c) => !c.parent_id);

  return (
    <section aria-label="댓글과 리더보드" className="flex flex-col rounded-xl border border-line bg-surface">
      <div role="tablist" aria-label="댓글과 리더보드" className="flex gap-1 border-b border-line px-3">
        <TabButton on={tab === "comments"} onClick={() => setTab("comments")}>
          댓글 {comments.length}
        </TabButton>
        {leaderboardEnabled && (
          <TabButton on={tab === "board"} onClick={() => setTab("board")}>
            리더보드
          </TabButton>
        )}
      </div>

      {tab === "comments" ? (
        <div role="tabpanel" aria-label="댓글" className="flex flex-col gap-6 p-5">
          <CommentForm gameId={gameId} parentId={null} />
          <ul className="m-0 flex list-none flex-col gap-6 p-0">
            {topLevel.map((c) => (
              <li key={c.id} className="flex flex-col gap-3">
                <CommentItem comment={c} gameId={gameId} meId={meId} uploaderId={uploaderId} canReply />
                {comments
                  .filter((r) => r.parent_id === c.id)
                  .map((r) => (
                    <div key={r.id} className="ml-12 rounded-[10px] bg-ground p-3">
                      <CommentItem comment={r} gameId={gameId} meId={meId} uploaderId={uploaderId} canReply={false} />
                    </div>
                  ))}
              </li>
            ))}
          </ul>
          {comments.length === 0 && <p className="m-0 text-center text-muted">첫 댓글을 남겨보세요.</p>}
        </div>
      ) : (
        <Leaderboard gameId={gameId} scoreOrder={scoreOrder} />
      )}
    </section>
  );
}

function TabButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={`h-[52px] border-b-[3px] px-3.5 text-[15px] font-bold ${on ? "border-accent text-ink" : "border-transparent text-muted"}`}
    >
      {children}
    </button>
  );
}

function CommentForm({ gameId, parentId, onDone }: { gameId: string; parentId: string | null; onDone?: () => void }) {
  const router = useRouter();
  const supabase = useRef(createClient()).current;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = parentId ? `reply-${parentId}` : "comment-input";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setBusy(true);
    setError(null);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("comments")
      .insert({ game_id: gameId, user_id: auth.user?.id, parent_id: parentId, content });
    setBusy(false);
    if (error) {
      setError("댓글을 올리지 못했어요");
      return;
    }
    setText("");
    onDone?.();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor={inputId} className={parentId ? "sr-only" : "text-sm font-bold"}>
        {parentId ? "답글 쓰기" : "댓글 쓰기"}
      </label>
      <textarea
        id={inputId}
        rows={parentId ? 2 : 3}
        maxLength={1000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={parentId ? "답글을 남겨주세요" : "게임 어땠나요?"}
        className="w-full resize-y rounded-[10px] border border-line-strong bg-surface p-3 text-[15px]"
      />
      {error && <p className="m-0 text-sm text-danger">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={busy} className="h-11 rounded-full bg-ink px-5 text-sm font-bold text-white disabled:opacity-60">
          {parentId ? "답글 등록" : "등록"}
        </button>
      </div>
    </form>
  );
}

function CommentItem({
  comment,
  gameId,
  meId,
  uploaderId,
  canReply,
}: {
  comment: CommentRow;
  gameId: string;
  meId: string | null;
  uploaderId: string;
  canReply: boolean;
}) {
  const router = useRouter();
  const supabase = useRef(createClient()).current;
  const [replying, setReplying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const mine = comment.user_id === meId;

  async function remove() {
    await supabase.from("comments").delete().eq("id", comment.id);
    router.refresh();
  }

  async function report() {
    const { error } = await supabase
      .from("reports")
      .insert({ target_type: "comment", comment_id: comment.id, game_id: gameId, reporter_id: meId, reason: "inappropriate" });
    setNotice(error?.code === "23505" ? "이미 신고한 댓글이에요" : error ? "신고하지 못했어요" : "신고가 접수됐어요");
  }

  return (
    <div className="flex gap-3">
      <span aria-hidden="true" className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#DDF1DA] text-[13px] font-bold text-[#166534]">
        {comment.nickname.charAt(0)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-bold">{comment.nickname}</span>
          {comment.user_id === uploaderId && (
            <span className="rounded bg-ink px-1.5 text-xs font-medium text-white">제작자</span>
          )}
          <span className="text-[13px] text-muted">{timeAgo(comment.created_at)}</span>
        </div>
        <p className="m-0 whitespace-pre-line text-body">{comment.content}</p>
        <div className="flex gap-1">
          {canReply && (
            <button type="button" onClick={() => setReplying((r) => !r)} className="h-8 rounded-md px-2 text-[13px] text-muted">
              답글
            </button>
          )}
          {mine ? (
            <button type="button" onClick={remove} className="h-8 rounded-md px-2 text-[13px] text-muted">
              삭제
            </button>
          ) : (
            <button type="button" onClick={report} className="h-8 rounded-md px-2 text-[13px] text-muted">
              신고
            </button>
          )}
        </div>
        {notice && (
          <p role="status" className="m-0 text-[13px] text-muted">
            {notice}
          </p>
        )}
        {replying && <CommentForm gameId={gameId} parentId={comment.id} onDone={() => setReplying(false)} />}
      </div>
    </div>
  );
}

function Leaderboard({ gameId, scoreOrder }: { gameId: string; scoreOrder: "asc" | "desc" }) {
  const supabase = useRef(createClient()).current;
  const [rows, setRows] = useState<BoardRow[] | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("get_leaderboard", { p_game_id: gameId, p_limit: 20 });
    setRows((data ?? []) as BoardRow[]);
  }, [gameId, supabase]);

  useEffect(() => {
    load();
    window.addEventListener("leaderboard:updated", load);
    return () => window.removeEventListener("leaderboard:updated", load);
  }, [load]);

  const me = rows?.find((r) => r.is_me);

  return (
    <div role="tabpanel" aria-label="리더보드" className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap justify-between gap-2 text-[13px] text-muted">
        <span>유저별 최고 점수 · {scoreOrder === "desc" ? "높을수록 좋음" : "낮을수록 좋음"}</span>
        {me && (
          <span className="font-bold text-ink">
            내 최고 기록: {me.best_score.toLocaleString()} ({me.rank}위)
          </span>
        )}
      </div>
      {rows === null ? (
        <p className="m-0 text-muted">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="m-0 text-muted">아직 기록이 없어요. 첫 기록의 주인공이 되어보세요!</p>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {rows.map((r) => (
            <li key={`${r.rank}-${r.nickname}`} className="flex items-center gap-3 border-b border-[#EFEEE8] px-1 py-3">
              <span
                className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg text-sm font-bold ${
                  r.rank === 1 ? "bg-accent text-white" : r.rank <= 3 ? "bg-accent-soft text-accent-ink" : "bg-chip text-ink"
                }`}
              >
                {r.rank}
              </span>
              <span className={`min-w-0 flex-1 ${r.is_me ? "font-bold" : "font-medium"}`}>{r.nickname}</span>
              <span className="font-bold">{r.best_score.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="m-0 text-[13px] text-muted">비정상적으로 높은 점수는 자동으로 빠지고 관리자가 검토해요.</p>
    </div>
  );
}
