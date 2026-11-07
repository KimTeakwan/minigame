/*
 * 리더보드 SDK
 * 게임 HTML에 아래 한 줄을 넣고, 게임이 끝날 때 GameSDK.submitScore(점수)를 부르면 돼요.
 *   <script src="https://[사이트 주소]/sdk.js"></script>
 *
 * 게임은 별도 도메인의 iframe 안에서 돌아가요. 이 함수는 점수를 바깥 플레이 페이지에
 * postMessage로 전달만 하고, 로그인 정보에는 손대지 않아요. 저장과 검증은 플레이 페이지와 서버가 해요.
 */
(function () {
  var sent = false;
  window.GameSDK = {
    submitScore: function (score) {
      if (sent) return; // 한 판에 한 번만
      if (typeof score !== "number" || !isFinite(score)) return;
      sent = true;
      window.parent.postMessage({ type: "GAMESDK_SCORE", score: score }, "*");
    },
    // 새 판을 시작할 때 부르면 다시 점수를 보낼 수 있어요.
    newRound: function () {
      sent = false;
      window.parent.postMessage({ type: "GAMESDK_NEW_ROUND" }, "*");
    },
  };
})();
