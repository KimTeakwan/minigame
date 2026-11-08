// 게임 검사 규칙. 검수 워커(review-worker.mjs), 공식 게임 검사(check-game.mjs),
// 공식 게임 올리기(publish-official-games.mjs)가 같이 써요.

// 모든 업로드 게임에서 나오면 안 되는 코드 패턴. 걸리면 검사 실패로 처리하고 사유를 알려줘요.
export const DANGEROUS = [
  { re: /document\.cookie/i, why: "쿠키에 접근하는 코드가 있어요" },
  { re: /(top|parent)\.location\s*(=|\.href\s*=|\.replace|\.assign)/i, why: "바깥 페이지를 다른 곳으로 보내는 코드가 있어요" },
  { re: /<form[^>]+action\s*=\s*["']https?:/i, why: "외부 사이트로 정보를 보내는 입력 양식이 있어요" },
  { re: /(eval|Function)\s*\(\s*atob\s*\(/i, why: "숨겨진 코드를 실행하는 부분이 있어요" },
  { re: /coinhive|cryptonight|coin-hive|webminer/i, why: "채굴 코드로 보이는 부분이 있어요" },
];

// 공식 게임에만 추가로 거는 규칙 (games/README.md "게임 규칙")
export const OFFICIAL_RULES = [
  { re: /https?:\/\/(?!www\.w3\.org\/)/i, why: "외부 주소가 들어 있어요. 모든 걸 index.html 안에 넣어야 해요" },
  { re: /\b(localStorage|sessionStorage|indexedDB)\b/, why: "저장소(localStorage 등)를 써요. 사이트 iframe에서는 오류가 나요" },
  { re: /(^|[^.\w$])(alert|confirm|prompt)\s*\(/m, why: "alert/confirm/prompt를 써요. 사이트 iframe에서는 막혀 있어요" },
  { re: /window\.open\s*\(/, why: "window.open을 써요. 사이트 iframe에서는 막혀 있어요" },
  { re: /requestFullscreen/, why: "전체화면을 직접 요청해요. 전체화면은 사이트 버튼이 맡아요" },
];

export const CATEGORIES = ["액션", "퍼즐", "캐주얼", "아케이드", "리듬", "스포츠", "기타"];
export const MAX_OFFICIAL_HTML_BYTES = 1024 * 1024;
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const ALLOWED_FILES = ["index.html", "game.json", "thumbnail.png"];

// game.json 확인. 문제 목록을 돌려줘요 (비어 있으면 통과).
export function validateGameJson(meta) {
  const errors = [];
  const str = (v) => typeof v === "string";
  if (!str(meta.title) || !meta.title.trim() || meta.title.length > 60) errors.push("title은 1~60자여야 해요");
  if (!str(meta.description) || !meta.description.trim() || meta.description.length > 2000) errors.push("description은 1~2000자여야 해요");
  if (!str(meta.howto) || !meta.howto.trim() || meta.howto.length > 1000) errors.push("howto는 1~1000자여야 해요");
  if (!CATEGORIES.includes(meta.category)) errors.push(`category는 ${CATEGORIES.join(", ")} 중 하나여야 해요`);
  if (!Array.isArray(meta.tags) || meta.tags.length > 10 || meta.tags.some((t) => !str(t) || !t.trim() || t.length > 20)) {
    errors.push("tags는 20자 이하 글자 최대 10개여야 해요");
  }
  if (!["keyboard", "touch", "both"].includes(meta.controls)) errors.push("controls는 keyboard, touch, both 중 하나여야 해요");
  if (typeof meta.leaderboard !== "boolean") errors.push("leaderboard는 true 또는 false여야 해요");
  if (!["asc", "desc"].includes(meta.score_order)) errors.push("score_order는 asc 또는 desc여야 해요");
  if (meta.ai_tool !== "Claude") errors.push('ai_tool은 "Claude"여야 해요');
  if (meta.idea !== undefined && (!str(meta.idea) || !meta.idea.trim())) errors.push("idea는 글자여야 해요 (없으면 항목을 빼요)");
  const known = ["title", "description", "howto", "category", "tags", "controls", "leaderboard", "score_order", "ai_tool", "idea"];
  for (const k of Object.keys(meta)) if (!known.includes(k)) errors.push(`모르는 항목이 있어요: ${k}`);
  return errors;
}

// 텍스트 파일 한 개에 대해 패턴 검사. 걸린 사유 목록을 돌려줘요.
export function scanText(text, rules) {
  return rules.filter((r) => r.re.test(text)).map((r) => r.why);
}
