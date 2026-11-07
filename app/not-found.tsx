import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <h1 className="m-0 text-[28px] font-black">페이지를 찾을 수 없어요</h1>
      <p className="m-0 text-muted">주소가 바뀌었거나 삭제된 페이지예요.</p>
      <Link href="/" className="mt-2 inline-flex h-11 items-center rounded-full bg-ink px-5 font-bold text-white no-underline">
        홈으로
      </Link>
    </div>
  );
}
