"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { REPORT_REASONS } from "@/lib/constants";

type Props = {
  gameId: string;
  title: string;
  src: string;
  leaderboardEnabled: boolean;
  initialLiked: boolean;
  initialLikeCount: number;
};

export default function GamePlayer({ gameId, title, src, leaderboardEnabled, initialLiked, initialLikeCount }: Props) {
  const supabase = useRef(createClient()).current;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const playIdRef = useRef<string | null>(null);

  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [reportOpen, setReportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // 플레이 시작 기록 (같은 유저는 게임당 하루 1회만 플레이수에 반영돼요)
  async function startPlay() {
    const { data, error } = await supabase.rpc("start_play", { p_game_id: gameId });
    playIdRef.current = error ? null : (data as string);
  }

  useEffect(() => {
    startPlay();

    // 게임 iframe에서 오는 리더보드 메시지 받기 (public/sdk.js 참고)
    async function onMessage(event: MessageEvent) {
      // 우리가 띄운 게임 iframe에서 온 메시지만 받아요
      if (event.source !== frameRef.current?.contentWindow) return;
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "GAMESDK_NEW_ROUND") {
        await startPlay();
        return;
      }
      if (msg.type === "GAMESDK_SCORE" && leaderboardEnabled && typeof msg.score === "number") {
        const playId = playIdRef.current;
        if (!playId) return;
        playIdRef.current = null; // 한 플레이에 점수 하나
        const { error } = await supabase.rpc("submit_score", { p_play_id: playId, p_score: msg.score });
        setNotice(error ? `점수를 저장하지 못했어요: ${error.message}` : `점수 ${msg.score.toLocaleString()}점이 기록됐어요`);
        window.dispatchEvent(new Event("leaderboard:updated"));
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  async function toggleLike() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    if (liked) {
      setLiked(false);
      setLikeCount((n) => Math.max(0, n - 1));
      await supabase.from("likes").delete().eq("game_id", gameId).eq("user_id", auth.user.id);
    } else {
      setLiked(true);
      setLikeCount((n) => n + 1);
      await supabase.from("likes").insert({ game_id: gameId, user_id: auth.user.id });
    }
  }

  async function report(reason: string) {
    setReportOpen(false);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabase
      .from("reports")
      .insert({ target_type: "game", game_id: gameId, reporter_id: auth.user.id, reason });
    setNotice(error?.code === "23505" ? "이미 신고한 게임이에요" : error ? "신고를 접수하지 못했어요" : "신고가 접수됐어요");
  }

  function fullscreen() {
    frameRef.current?.requestFullscreen?.();
  }

  return (
    <div className="flex flex-col">
      {/* 게임은 별도 도메인에서, allow-same-origin 없이 실행돼요. 로그인 쿠키에 접근할 수 없어요. */}
      <iframe
        ref={frameRef}
        src={src}
        title={`${title} 게임 화면`}
        sandbox="allow-scripts allow-pointer-lock"
        allow="fullscreen; gamepad"
        className="aspect-video w-full rounded-t-2xl border-0 bg-ink"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-b-2xl bg-[#23232A] px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={liked}
            onClick={toggleLike}
            className={`inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-bold ${
              liked ? "bg-accent-soft text-accent-ink" : "bg-[#33333B] text-white"
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20s-7-4.4-9.2-8.8A5.2 5.2 0 0 1 12 6.4a5.2 5.2 0 0 1 9.2 4.8C19 15.6 12 20 12 20z" />
            </svg>
            좋아요 {likeCount.toLocaleString()}
          </button>
          <div className="relative">
            <button
              type="button"
              aria-expanded={reportOpen}
              onClick={() => setReportOpen((o) => !o)}
              className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#33333B] px-4 text-sm font-medium text-white"
            >
              신고
            </button>
            {reportOpen && (
              <div
                role="group"
                aria-label="신고 사유"
                className="absolute left-0 top-[calc(100%+8px)] z-10 flex w-[300px] flex-col gap-1 rounded-xl border border-line bg-surface p-3 text-ink shadow-[0_8px_24px_rgba(23,23,28,0.16)]"
              >
                <span className="px-2 py-1 text-[13px] font-bold text-muted">신고 사유 선택</span>
                {REPORT_REASONS.map((r) => (
                  <button key={r.key} type="button" onClick={() => report(r.key)} className="min-h-11 rounded-lg px-2 text-left hover:bg-chip">
                    {r.label}
                  </button>
                ))}
                <div className="mt-1 flex flex-col gap-0.5 border-t border-line px-2 pt-2.5">
                  <Link href={`/copyright?game=${gameId}`} className="text-sm font-bold text-accent">
                    저작권 침해 신고
                  </Link>
                  <span className="text-xs text-muted">권리자 전용 양식 · 로그인 없이 접수</span>
                </div>
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={fullscreen}
          className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#33333B] px-4 text-sm font-medium text-white"
        >
          전체화면
        </button>
      </div>
      {notice && (
        <p role="status" className="m-0 mt-2 text-sm text-body">
          {notice}
        </p>
      )}
    </div>
  );
}
