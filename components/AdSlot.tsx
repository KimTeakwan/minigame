// 광고 자리. 구글 애드센스 승인을 받으면 이 안에 광고 코드를 넣어요.
export default function AdSlot({ label, minHeight = 90 }: { label: string; minHeight?: number }) {
  return (
    <aside
      aria-label="광고"
      className="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-[#B9B7AE] bg-surface p-3 text-center text-[13px] text-muted"
      style={{ minHeight }}
    >
      <span className="font-bold">광고</span>
      <span>{label}</span>
    </aside>
  );
}
