import { notFound } from "next/navigation";

const PAGES: Record<string, { title: string; body: string }> = {
  terms: { title: "이용약관", body: "[이용약관 내용을 여기에 넣으세요]" },
  privacy: { title: "개인정보처리방침", body: "[개인정보처리방침 내용을 여기에 넣으세요]" },
  "content-policy": {
    title: "콘텐츠 정책",
    body:
      "이 사이트에는 전체이용가 게임만 올릴 수 있어요.\n" +
      "다른 사람의 게임·캐릭터·음악·이미지를 허락 없이 쓰면 안 돼요.\n" +
      "신고가 쌓이면 게임이 자동으로 비공개되고, 검토 후 삭제되면 계정 경고를 받아요.\n" +
      "경고 1회는 경고, 2회는 업로드 7일 정지, 3회는 이용 정지예요.\n\n" +
      "[세부 내용을 여기에 넣으세요]",
  },
  "copyright-agent": {
    title: "신고 접수 담당자 안내",
    body:
      "저작권법 제103조에 따른 복제·전송 중단 및 재개 요청 접수 담당자\n" +
      "이름: [담당자 이름]\n이메일: [담당자 이메일]\n\n" +
      "권리자는 /copyright 페이지에서도 신고할 수 있어요.",
  },
};

type Params = Promise<{ slug: string }>;

export default async function LegalPage({ params }: { params: Params }) {
  const { slug } = await params;
  const page = PAGES[slug];
  if (!page) notFound();
  return (
    <article className="mx-auto flex w-full max-w-[760px] flex-col gap-4 rounded-2xl border border-line bg-surface p-8">
      <h1 className="m-0 text-[28px] font-black">{page.title}</h1>
      <p className="m-0 whitespace-pre-line text-body">{page.body}</p>
    </article>
  );
}
