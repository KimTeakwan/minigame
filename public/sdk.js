/*
 * 게임 SDK (리더보드 + 멀티플레이)
 * 게임 HTML에 아래 한 줄을 넣어요.
 *   <script src="https://[사이트 주소]/sdk.js"></script>
 *
 * 게임은 별도 도메인의 iframe 안에서 돌아가고 네트워크에 직접 접속하지 않아요.
 * 이 SDK는 바깥 플레이 페이지와 postMessage로만 이야기해요. 저장·검증·중계는 플레이 페이지와 서버가 해요.
 *
 * ── 리더보드 ──
 *   GameSDK.submitScore(점수)   게임이 끝날 때 한 번
 *   GameSDK.newRound()          다시 시작할 때
 *
 * ── 멀티플레이 (업로드할 때 '멀티 게임'으로 등록한 게임만) ──
 *   GameSDK.multi.join()          방에 들어가요. Promise → { roomId, me, players, hostId, maxPlayers }
 *                                 사이트 밖(파일을 직접 연 경우)이거나 실패하면 reject → 혼자/컴퓨터 상대 모드로 시작해요.
 *   GameSDK.multi.send(data)      같은 방 다른 사람들에게 보내요. JSON 2KB 이하, 1초에 10개까지.
 *   GameSDK.multi.on("message", function (data, fromId) {})
 *   GameSDK.multi.on("players", function (players, hostId) {})   // 들어오고 나갈 때마다
 *   GameSDK.multi.on("emote",   function (key, fromId) {})        // hi gg again wow oops thanks
 *   GameSDK.multi.on("error",   function (message) {})
 *   GameSDK.multi.emote(key)      이모티콘 보내기 (자유 채팅은 없어요)
 *   GameSDK.multi.lock(true)      판이 시작되면 방을 잠가 새 사람이 못 들어오게 해요
 *   GameSDK.multi.leave()
 *   GameSDK.multi.me() / players() / hostId() / isHost()
 *   방장(host)은 가장 먼저 들어온 사람이에요. 방장이 나가면 다음 사람이 이어받아요.
 */
(function () {
  var sent = false;
  var standalone = window.parent === window; // 파일을 직접 열었을 때
  var listeners = { message: [], players: [], emote: [], error: [] };
  var room = { joined: false, roomId: null, me: null, players: [], hostId: null, maxPlayers: 0 };
  var waiting = [];

  function post(msg) {
    if (!standalone) window.parent.postMessage(msg, "*");
  }
  function emit(name, a, b) {
    var list = listeners[name] || [];
    for (var i = 0; i < list.length; i++) {
      try { list[i](a, b); } catch (e) { setTimeout(function () { throw e; }); }
    }
  }
  function settle(ok, value) {
    var list = waiting;
    waiting = [];
    for (var i = 0; i < list.length; i++) {
      clearTimeout(list[i].timer);
      ok ? list[i].resolve(value) : list[i].reject(new Error(value));
    }
  }

  window.addEventListener("message", function (event) {
    if (standalone || event.source !== window.parent) return; // 바깥 플레이 페이지에서 온 것만
    var m = event.data;
    if (!m || typeof m !== "object") return;
    if (m.type === "GAMESDK_MP_JOINED") {
      room = { joined: true, roomId: m.roomId, me: m.me, players: m.players || [], hostId: m.hostId, maxPlayers: m.maxPlayers };
      settle(true, { roomId: room.roomId, me: room.me, players: room.players, hostId: room.hostId, maxPlayers: room.maxPlayers });
      emit("players", room.players, room.hostId);
    } else if (m.type === "GAMESDK_MP_PLAYERS") {
      room.players = m.players || [];
      room.hostId = m.hostId;
      emit("players", room.players, room.hostId);
    } else if (m.type === "GAMESDK_MP_MESSAGE") {
      emit("message", m.data, m.from);
    } else if (m.type === "GAMESDK_MP_EMOTE") {
      emit("emote", m.key, m.from);
    } else if (m.type === "GAMESDK_MP_ERROR") {
      if (!room.joined) settle(false, m.message);
      emit("error", m.message);
    }
  });

  window.GameSDK = {
    submitScore: function (score) {
      if (sent) return; // 한 판에 한 번만
      if (typeof score !== "number" || !isFinite(score)) return;
      sent = true;
      post({ type: "GAMESDK_SCORE", score: score });
    },
    // 새 판을 시작할 때 부르면 다시 점수를 보낼 수 있어요.
    newRound: function () {
      sent = false;
      post({ type: "GAMESDK_NEW_ROUND" });
    },
    multi: {
      join: function () {
        return new Promise(function (resolve, reject) {
          if (standalone) return reject(new Error("사이트 밖에서는 멀티를 쓸 수 없어요"));
          var w = { resolve: resolve, reject: reject, timer: 0 };
          w.timer = setTimeout(function () {
            waiting = waiting.filter(function (x) { return x !== w; });
            reject(new Error("방에 들어가지 못했어요 (응답 없음)"));
          }, 8000);
          waiting.push(w);
          post({ type: "GAMESDK_MP_JOIN" });
        });
      },
      send: function (data) { if (room.joined) post({ type: "GAMESDK_MP_SEND", data: data }); },
      emote: function (key) { if (room.joined) post({ type: "GAMESDK_MP_EMOTE", key: key }); },
      lock: function (locked) { if (room.joined) post({ type: "GAMESDK_MP_LOCK", locked: locked !== false }); },
      leave: function () {
        if (!room.joined) return;
        room = { joined: false, roomId: null, me: null, players: [], hostId: null, maxPlayers: 0 };
        post({ type: "GAMESDK_MP_LEAVE" });
      },
      on: function (name, fn) { if (listeners[name] && typeof fn === "function") listeners[name].push(fn); },
      me: function () { return room.me; },
      players: function () { return room.players.slice(); },
      hostId: function () { return room.hostId; },
      isHost: function () { return !!room.me && room.me.id === room.hostId; },
    },
  };
})();
