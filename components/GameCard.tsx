import Link from "next/link";
import type { GameCardData } from "@/lib/types";
import { CONTROL_LABELS, aiToolLabel } from "@/lib/constants";
import OfficialBadge from "@/components/OfficialBadge";

const TINTS = [
  ["#FDE7D9", "#9A3412"],
  ["#DCE8FB", "#1E40AF"],
  ["#DDF1DA", "#166534"],
  ["#ECE3FB", "#6B21A8"],
  ["#FFF0C2", "#854D0E"],
];

// 썸네일이 없을 때 쓰는 색 블록. 같은 게임은 늘 같은 색이 나오게 id로 골라요.
function tintFor(id: string) {
  let sum = 0;
  for (const ch of id) sum += ch.charCodeAt(0);
  return TINTS[sum % TINTS.length];
}

type Props = {
  game: GameCardData;
  rank?: number;
  badge?: string; // 검색 결과의 "제목 일치" 같은 표시
};

export default function GameCard({ game, rank, badge }: Props) {
  const [bg, fg] = tintFor(game.id);

  return (
    <Link
      href={`/games/${game.id}`}
      className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface text-ink no-underline"
    >
      <div className="relative flex aspect-[4/3] items-center justify-center" style={{ background: bg }}>
        {game.thumbnail_url ? (
          // 썸네일은 R2 주소라 next/image 대신 img를 써요
          // eslint-disable-next-line @next/next/no-img-element
          <img src={game.thumbnail_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true" className="font-display text-[56px] leading-none" style={{ color: fg }}>
            {game.title.charAt(0)}
          </span>
        )}
        {rank !== undefined && (
          <span className="absolute left-2.5 top-2.5 flex h-7 min-w-7 items-center justify-center rounded-lg bg-ink px-2 text-sm font-bold text-white">
            {rank}
          </span>
        )}
        {game.controls === "keyboard" && (
          <span className="absolute right-2.5 top-2.5 rounded-md bg-ink px-2 py-0.5 text-xs font-medium text-white">PC 권장</span>
        )}
        {game.ai_tool && (
          <span className="absolute bottom-2.5 left-2.5 rounded-md bg-white px-2 py-0.5 text-xs font-medium text-ink">
            {aiToolLabel(game.ai_tool)}
          </span>
        )}
        {game.multiplayer && (
          <span className="absolute bottom-2.5 right-2.5 rounded-md bg-accent px-2 py-0.5 text-xs font-bold text-white">
            멀티 {game.max_players}인
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 px-3.5 pb-3.5 pt-3">
        {badge && (
          <span className="self-start rounded-md bg-accent-soft px-2 py-px text-xs font-medium text-accent-ink">{badge}</span>
        )}
        <span className="text-base font-bold">{game.title}</span>
        <span className="flex flex-wrap items-center gap-1 text-[13px] text-muted">
          {game.uploader_nickname}
          {game.uploader_is_official && <OfficialBadge />}
          {game.category_name ? <span>· {game.category_name}</span> : null}
        </span>
        <span className="flex flex-wrap items-center gap-x-1 text-[13px] text-muted">
          {game.live_count > 0 && (
            <span className="inline-flex items-center gap-1 font-bold text-[#15803d]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" aria-hidden="true" />
              {game.live_count.toLocaleString()}명 플레이 중 ·
            </span>
          )}
          좋아요 {game.like_count.toLocaleString()} · {CONTROL_LABELS[game.controls]}
        </span>
      </div>
    </Link>
  );
}
