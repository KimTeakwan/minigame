import Link from "next/link";
import { SORTS, type SortKey } from "@/lib/constants";

// 인기순·최신순·좋아요순 전환. 주소의 ?sort= 값을 바꾸는 링크라 서버에서 다시 정렬돼요.
export default function SortTabs({ current, makeHref }: { current: SortKey; makeHref: (sort: SortKey) => string }) {
  return (
    <div role="group" aria-label="정렬" className="flex gap-1 rounded-full border border-line bg-surface p-1">
      {SORTS.map((s) => {
        const on = s.key === current;
        return (
          <Link
            key={s.key}
            href={makeHref(s.key)}
            aria-current={on ? "true" : undefined}
            className={`flex h-9 items-center rounded-full px-3.5 text-sm font-medium no-underline ${
              on ? "bg-ink text-white" : "text-body"
            }`}
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}

export function parseSort(value: string | string[] | undefined): SortKey {
  return value === "latest" || value === "likes" ? value : "popular";
}

export function sortColumn(sort: SortKey) {
  return sort === "latest" ? "created_at" : sort === "likes" ? "like_count" : "popular_score";
}
