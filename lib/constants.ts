// 운영 규칙 숫자는 여기서 한 번에 바꿔요. (DB 쪽 숫자는 supabase/migrations/ 첫 파일 맨 위 주석 참고)
export const MAX_GAME_FILE_BYTES = 50 * 1024 * 1024; // 게임당 50MB
export const DAILY_UPLOAD_LIMIT = 5; // 하루 업로드 개수
export const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

// published_games 뷰에서 게임 카드에 필요한 컬럼
export const CARD_COLUMNS =
  "id,title,thumbnail_url,controls,ai_tool,tags,category_name,uploader_nickname,uploader_is_official,play_count,like_count,created_at";

export const CONTROL_LABELS: Record<string, string> = {
  keyboard: "키보드",
  touch: "터치",
  both: "키보드·터치",
};

export const AI_TOOLS = ["Claude", "Cursor", "Replit", "ChatGPT", "기타"];

export const SORTS = [
  { key: "popular", label: "인기순" },
  { key: "latest", label: "최신순" },
  { key: "likes", label: "좋아요순" },
] as const;

export type SortKey = (typeof SORTS)[number]["key"];

export const REPORT_REASONS = [
  { key: "inappropriate", label: "부적절한 콘텐츠" },
  { key: "broken_spam", label: "작동 안 함 / 스팸" },
  { key: "malicious", label: "악성 동작" },
] as const;

export function gameFileUrl(storagePath: string) {
  return `${process.env.NEXT_PUBLIC_GAME_ORIGIN}/${storagePath}/index.html`;
}

// 게임 페이지 배지 문구. 영어 이름은 발음에 따라 조사가 달라서 직접 적어둬요.
const AI_TOOL_BADGES: Record<string, string> = {
  Claude: "Claude로 제작",
  Cursor: "Cursor로 제작",
  Replit: "Replit으로 제작",
  ChatGPT: "ChatGPT로 제작",
  기타: "AI 툴로 제작",
};

export function aiToolLabel(tool: string) {
  return AI_TOOL_BADGES[tool] ?? "AI 툴로 제작";
}
