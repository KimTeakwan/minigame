// published_games 뷰 한 줄 (게임 카드에 필요한 정보)
export type GameCardData = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  controls: "keyboard" | "touch" | "both";
  ai_tool: string | null;
  tags: string[];
  category_name: string | null;
  uploader_nickname: string;
  uploader_is_official: boolean; // 공식 계정(운영팀 AI 제작)이 올린 게임
  play_count: number;
  like_count: number;
  created_at: string;
};

export type GameStatus =
  | "uploading" // 파일 올리는 중
  | "pending" // 자동 검사 대기
  | "published" // 공개
  | "rejected" // 검사 실패
  | "hidden" // 신고 누적으로 비공개
  | "hidden_copyright" // 저작권 신고로 비공개
  | "deleted";

export const STATUS_LABELS: Record<GameStatus, string> = {
  uploading: "업로드 중",
  pending: "검사 중",
  published: "공개",
  rejected: "검사 실패",
  hidden: "비공개 · 신고 검토 중",
  hidden_copyright: "비공개 · 저작권 신고",
  deleted: "삭제됨",
};
