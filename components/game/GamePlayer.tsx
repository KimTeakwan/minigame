"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { REPORT_REASONS } from "@/lib/constants";
import { EMOTES, MultiplayerRelay, type EmoteKey, type MpPlayer, type MpStatus } from "@/lib/multiplayer";

type Props = {
  gameId: string;
  title: string;
  src: string;
  leaderboardEnabled: boolean;
  initialLiked: boolean;
  initialLikeCount: number;
  initialLiveCount: number;
  multiplayer: boolean;
  maxPlayers: number;
  me: { id: string; name: string };
};

const HEARTBEAT_MS = 30_000; // DB의 live_cutoff()(75초)보다 충분히 짧게

export default function GamePlayer({
  gameId, title, src, leaderboardEnabled, initialLiked, initialLikeCount, initialLiveCount, multiplayer, maxPlayers, me,
}: Props) {
  const supabase = useRef(createClient()).current;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const playIdRef = useRef<string | null>(null);
  const relayRef = useRef<MultiplayerRelay | null>(null);

  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [liveCount, setLiveCount] = useState(initialLiveCount);
  const [reportOpen, setReportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [room, setRoom] = useState<{ status: MpStatus; maxPlayers: number; players: MpPlayer[]; hostId: string | null }>({
    status: "idle", maxPlayers, players: [], hostId: null,
  });
  const [bubbles, setBubbles] = useState<Record<string, { key: EmoteKey; at: number }>>({});

  // 게임 iframe으로 보내기. 게임은 allow-same-origin 없는 sandbox라 주소(origin)가 "null"이어서 "*"로 보내요.
  // 보내는 내용은 같은 방 사람들의 닉네임과 게임 데이터뿐이에요.
  function postToGame(message: unknown) {
    frameRef.current?.contentWindow?.postMessage(message, "*");
  }

  // 플레이 시작 기록 (같은 유저는 게임당 하루 1회만 플레이수에 반영돼요)
  async function startPlay() {
    const { data, error } = await supabase.rpc("start_play", { p_game_id: gameId });
    playIdRef.current = error ? null : (data as string);
  }

  // 접속자 수: 30초마다 '아직 보고 있어요'를 알리고, 이 게임의 지금 접속자 수를 받아와요
  async function heartbeat() {
    if (document.visibilityState !== "visible") return;
    await supabase.rpc("heartbeat", { p_game_id: gameId, p_keep_room: !!relayRef.current?.roomId });
    const { data } = await supabase.from("game_live_counts").select("players").eq("game_id", gameId).maybeSingle();
    setLiveCount(data?.players ?? 0);
  }

  useEffect(() => {
    startPlay();
    heartbeat();
    const timer = setInterval(heartbeat, HEARTBEAT_MS);
    const onVisible = () => document.visibilityState === "visible" && heartbeat();
    document.addEventListener("visibilitychange", onVisible);

    if (multiplayer) {
      relayRef.current = new MultiplayerRelay({
        supabase,
        gameId,
        me,
        post: postToGame,
        onChange: (s) => setRoom({ status: s.status, maxPlayers: s.maxPlayers || maxPlayers, players: s.players, hostId: s.hostId }),
        onEmote: (fromId, key) => setBubbles((b) => ({ ...b, [fromId]: { key, at: Date.now() } })),
      });
    }

    async function onMessage(event: MessageEvent) {
      // 우리가 띄운 게임 iframe에서 온 메시지만 받아요
      if (event.source !== frameRef.current?.contentWindow) return;
      const msg = event.data;
      if (!msg || typeof msg !== "object" || typeof msg.type !== "string") return;

      if (msg.type.startsWith("GAMESDK_MP_")) {
        if (relayRef.current) relayRef.current.handleGameMessage(msg);
        else postToGame({ type: "GAMESDK_MP_ERROR", message: "멀티 게임으로 등록되지 않은 게임이에요" });
        return;
      }
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

    // 페이지를 떠나면 바로 접속자 수에서 빠져요 (못 보내도 75초 뒤에 자동으로 빠져요)
    const onLeave = () => {
      void relayRef.current?.leave();
      void supabase.rpc("leave_game");
    };

    window.addEventListener("message", onMessage);
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("pagehide", onLeave);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
      onLeave();
      relayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  // 이모티콘 말풍선은 3초 뒤에 사라져요
  useEffect(() => {
    const ids = Object.keys(bubbles);
    if (!ids.length) return;
    const t = setTimeout(() => {
      const now = Date.now();
      setBubbles((b) => Object.fromEntries(Object.entries(b).filter(([, v]) => now - v.at < 3000)));
    }, 3000);
    return () => clearTimeout(t);
  }, [bubbles]);

  async function toggleLike() {
    if (liked) {
      setLiked(false);
      setLikeCount((n) => Math.max(0, n - 1));
      await supabase.from("likes").delete().eq("game_id", gameId).eq("user_id", me.id);
    } else {
      setLiked(true);
      setLikeCount((n) => n + 1);
      await supabase.from("likes").insert({ game_id: gameId, user_id: me.id });
    }
  }

  async function report(reason: string) {
    setReportOpen(false);
    const { error } = await supabase.from("reports").insert({ target_type: "game", game_id: gameId, reporter_id: me.id, reason });
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
      <div className={`flex flex-wrap items-center justify-between gap-2 bg-[#23232A] px-3 py-2.5 ${multiplayer ? "" : "rounded-b-2xl"}`}>
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
          <span className="inline-flex h-11 items-center gap-1.5 px-2 text-sm font-medium text-white" aria-live="polite">
            <span className="h-2 w-2 rounded-full bg-[#22c55e]" aria-hidden="true" />
            {liveCount.toLocaleString()}명 플레이 중
          </span>
        </div>
        <button
          type="button"
          onClick={fullscreen}
          className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#33333B] px-4 text-sm font-medium text-white"
        >
          전체화면
        </button>
      </div>

      {multiplayer && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-[#33333B] bg-[#1B1B21] px-3 py-2.5 text-white">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm font-bold">
              {room.status === "joined"
                ? `멀티 방 ${room.players.length}/${room.maxPlayers}명`
                : room.status === "joining"
                  ? "방 찾는 중…"
                  : room.status === "error"
                    ? "방에 들어가지 못했어요"
                    : `멀티 게임 · 최대 ${maxPlayers}명`}
            </span>
            {room.players.map((p) => {
              const bubble = bubbles[p.id];
              const emote = bubble && EMOTES.find((e) => e.key === bubble.key);
              return (
                <span key={p.id} className="relative inline-flex h-8 items-center gap-1 rounded-full bg-[#33333B] px-3 text-[13px]">
                  {p.id === room.hostId && <span title="방장" aria-label="방장">👑</span>}
                  {p.name}
                  {p.id === me.id && <span className="text-muted"> (나)</span>}
                  {emote && (
                    <span
                      role="status"
                      className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[13px] font-bold text-ink shadow"
                    >
                      {emote.icon} {emote.label}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="이모티콘 보내기">
            {EMOTES.map((e) => (
              <button
                key={e.key}
                type="button"
                disabled={room.status !== "joined"}
                onClick={() => relayRef.current?.emote(e.key)}
                title={e.label}
                aria-label={`이모티콘 보내기: ${e.label}`}
                className="h-9 min-w-9 rounded-full bg-[#33333B] px-2 text-base disabled:opacity-40"
              >
                {e.icon}
              </button>
            ))}
          </div>
        </div>
      )}

      {notice && (
        <p role="status" className="m-0 mt-2 text-sm text-body">
          {notice}
        </p>
      )}
    </div>
  );
}
