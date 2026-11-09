// 멀티플레이 중계 (플레이 페이지 쪽)
//
// 게임 iframe은 네트워크에 직접 접속하지 않아요. 게임이 GameSDK.multi로 postMessage를 보내면
// 이 중계기가 받아서 Supabase Realtime 비공개 채널('room:<방 id>')로 같은 방 사람들에게 전하고,
// 받은 메시지를 다시 게임 iframe에 넘겨줘요.
//
//   게임 → 페이지: GAMESDK_MP_JOIN / _SEND {data} / _EMOTE {key} / _LOCK {locked} / _LEAVE
//   페이지 → 게임: GAMESDK_MP_JOINED {roomId, me, players, hostId, maxPlayers}
//                  GAMESDK_MP_PLAYERS {players, hostId} / _MESSAGE {from, data} / _EMOTE {from, key} / _ERROR {message}
//
// 같은 규칙을 games/_preview/multi.html(로컬 미리보기·검사용 가짜 중계)도 따라요. 바꿀 땐 둘 다 고쳐요.

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export const MP_MAX_MESSAGE_BYTES = 2048; // 메시지 하나 최대 크기
export const MP_MAX_SENDS_PER_SEC = 10; // 한 사람이 1초에 보낼 수 있는 메시지 수

// 자유 채팅 대신 쓰는 이모티콘 (게임과 플레이 화면 버튼이 같이 써요)
export const EMOTES = [
  { key: "hi", icon: "👋", label: "안녕!" },
  { key: "gg", icon: "🤝", label: "GG" },
  { key: "again", icon: "🔁", label: "한 판 더" },
  { key: "wow", icon: "😮", label: "대단해요" },
  { key: "oops", icon: "😅", label: "앗" },
  { key: "thanks", icon: "🙏", label: "고마워요" },
] as const;
export type EmoteKey = (typeof EMOTES)[number]["key"];
const EMOTE_KEYS: readonly string[] = EMOTES.map((e) => e.key);

export type MpPlayer = { id: string; name: string; joinedAt: number };
export type MpStatus = "idle" | "joining" | "joined" | "error";

type Options = {
  supabase: SupabaseClient;
  gameId: string;
  me: { id: string; name: string };
  /** 게임 iframe으로 메시지 보내기 */
  post: (message: unknown) => void;
  onChange?: (state: { status: MpStatus; roomId: string | null; maxPlayers: number; players: MpPlayer[]; hostId: string | null }) => void;
  onEmote?: (fromId: string, key: EmoteKey) => void;
};

export class MultiplayerRelay {
  private opts: Options;
  private channel: RealtimeChannel | null = null;
  private status: MpStatus = "idle";
  private joinedAt = 0;
  private tokens = MP_MAX_SENDS_PER_SEC;
  private lastRefill = Date.now();
  private lastLimitNotice = 0;
  roomId: string | null = null;
  maxPlayers = 0;
  players: MpPlayer[] = [];
  hostId: string | null = null;

  constructor(opts: Options) {
    this.opts = opts;
  }

  get inRoom() {
    return this.roomId !== null && this.status === "joined";
  }

  /** 게임 iframe에서 온 GAMESDK_MP_* 메시지를 처리해요. 처리했으면 true. */
  handleGameMessage(msg: { type?: unknown; [k: string]: unknown }): boolean {
    switch (msg.type) {
      case "GAMESDK_MP_JOIN":
        void this.join();
        return true;
      case "GAMESDK_MP_SEND":
        this.send(msg.data);
        return true;
      case "GAMESDK_MP_EMOTE":
        this.emote(String(msg.key ?? ""));
        return true;
      case "GAMESDK_MP_LOCK":
        void this.lock(msg.locked === true);
        return true;
      case "GAMESDK_MP_LEAVE":
        void this.leave();
        return true;
      default:
        return false;
    }
  }

  async join() {
    const { supabase, gameId, me, post } = this.opts;
    if (this.status === "joining") return;
    if (this.status === "joined") {
      // 이미 방에 있으면 지금 상태를 다시 알려줘요 (게임이 새 판에서 join을 또 부른 경우)
      post(this.joinedMessage());
      return;
    }
    this.setStatus("joining");

    const { data, error } = await supabase.rpc("join_room", { p_game_id: gameId });
    if (error || !data) return this.fail(error?.message ?? "방에 들어가지 못했어요");
    const room = data as { room_id: string; max_players: number };
    this.roomId = room.room_id;
    this.maxPlayers = room.max_players;

    // 비공개 채널은 로그인 토큰으로 권한을 확인해요 (DB의 realtime.messages RLS)
    const { data: session } = await supabase.auth.getSession();
    if (session.session) await supabase.realtime.setAuth(session.session.access_token);

    this.joinedAt = Date.now();
    const channel = supabase.channel(`room:${this.roomId}`, {
      config: { private: true, broadcast: { self: false }, presence: { key: me.id } },
    });
    this.channel = channel;

    channel
      .on("broadcast", { event: "g" }, ({ payload }) => {
        const p = payload as { from?: unknown; data?: unknown };
        if (typeof p.from !== "string") return;
        post({ type: "GAMESDK_MP_MESSAGE", from: p.from, data: p.data });
      })
      .on("broadcast", { event: "e" }, ({ payload }) => {
        const p = payload as { from?: unknown; key?: unknown };
        if (typeof p.from !== "string" || typeof p.key !== "string" || !EMOTE_KEYS.includes(p.key)) return;
        post({ type: "GAMESDK_MP_EMOTE", from: p.from, key: p.key });
        this.opts.onEmote?.(p.from, p.key as EmoteKey);
      })
      .on("presence", { event: "sync" }, () => {
        this.readPresence();
        if (this.status === "joined") post({ type: "GAMESDK_MP_PLAYERS", players: this.players, hostId: this.hostId });
        this.changed();
      })
      .subscribe(async (state, err) => {
        if (state === "SUBSCRIBED") {
          await channel.track({ name: me.name, joined_at: this.joinedAt });
          this.readPresence();
          this.setStatus("joined");
          post(this.joinedMessage());
        } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
          this.fail(err?.message ? `실시간 연결이 안 돼요: ${err.message}` : "실시간 연결이 안 돼요");
        }
      });
  }

  send(data: unknown) {
    if (!this.channel || this.status !== "joined") return;
    let size = 0;
    try {
      size = new TextEncoder().encode(JSON.stringify(data ?? null)).length;
    } catch {
      return this.notice("보낼 수 없는 데이터예요 (JSON으로 바꿀 수 있는 값만 돼요)");
    }
    if (size > MP_MAX_MESSAGE_BYTES) return this.notice(`메시지가 너무 커요 (${size}바이트, 최대 ${MP_MAX_MESSAGE_BYTES})`);
    if (!this.takeToken()) return this.notice(`메시지를 너무 자주 보내요 (1초에 ${MP_MAX_SENDS_PER_SEC}개까지)`);
    void this.channel.send({ type: "broadcast", event: "g", payload: { from: this.opts.me.id, data } });
  }

  emote(key: string) {
    if (!this.channel || this.status !== "joined" || !EMOTE_KEYS.includes(key)) return;
    if (!this.takeToken()) return;
    void this.channel.send({ type: "broadcast", event: "e", payload: { from: this.opts.me.id, key } });
    this.opts.onEmote?.(this.opts.me.id, key as EmoteKey);
  }

  async lock(locked: boolean) {
    if (!this.roomId) return;
    const { error } = await this.opts.supabase.rpc("set_room_locked", { p_room_id: this.roomId, p_locked: locked });
    if (error) this.notice(error.message);
  }

  async leave() {
    const channel = this.channel;
    this.channel = null;
    this.roomId = null;
    this.players = [];
    this.hostId = null;
    this.setStatus("idle");
    if (channel) {
      await channel.untrack().catch(() => {});
      await this.opts.supabase.removeChannel(channel);
    }
    await this.opts.supabase.rpc("leave_room");
  }

  // ---------------------------------------------------------------- 내부
  private readPresence() {
    if (!this.channel) return;
    const state = this.channel.presenceState() as Record<string, { name?: unknown; joined_at?: unknown }[]>;
    const list: MpPlayer[] = [];
    for (const [id, metas] of Object.entries(state)) {
      const m = metas[0];
      if (!m) continue;
      list.push({
        id,
        name: typeof m.name === "string" ? m.name.slice(0, 20) : "플레이어",
        joinedAt: typeof m.joined_at === "number" ? m.joined_at : Date.now(),
      });
    }
    // 먼저 들어온 사람이 방장(host)이에요. 방장이 나가면 다음 사람이 이어받아요.
    list.sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
    this.players = list;
    this.hostId = list[0]?.id ?? null;
  }

  private joinedMessage() {
    return {
      type: "GAMESDK_MP_JOINED",
      roomId: this.roomId,
      me: this.opts.me,
      players: this.players,
      hostId: this.hostId,
      maxPlayers: this.maxPlayers,
    };
  }

  private takeToken() {
    const now = Date.now();
    this.tokens = Math.min(MP_MAX_SENDS_PER_SEC, this.tokens + ((now - this.lastRefill) / 1000) * MP_MAX_SENDS_PER_SEC);
    this.lastRefill = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  private notice(message: string) {
    // 같은 경고를 게임에 너무 자주 보내지 않아요
    if (Date.now() - this.lastLimitNotice < 1000) return;
    this.lastLimitNotice = Date.now();
    this.opts.post({ type: "GAMESDK_MP_ERROR", message });
  }

  private fail(message: string) {
    this.setStatus("error");
    this.opts.post({ type: "GAMESDK_MP_ERROR", message });
    const channel = this.channel;
    this.channel = null;
    this.roomId = null;
    if (channel) void this.opts.supabase.removeChannel(channel);
    void this.opts.supabase.rpc("leave_room");
  }

  private setStatus(status: MpStatus) {
    this.status = status;
    this.changed();
  }

  private changed() {
    this.opts.onChange?.({
      status: this.status,
      roomId: this.roomId,
      maxPlayers: this.maxPlayers,
      players: this.players,
      hostId: this.hostId,
    });
  }
}
