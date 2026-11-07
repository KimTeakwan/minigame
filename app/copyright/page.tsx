import CopyrightForm from "@/components/copyright/CopyrightForm";

type SearchParams = Promise<{ game?: string }>;

// 권리자 전용 저작권 침해 신고. 회원이 아니어도 접수할 수 있어요.
export default async function CopyrightPage({ searchParams }: { searchParams: SearchParams }) {
  const { game } = await searchParams;
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[28px] font-black">저작권 침해 신고</h1>
        <p className="m-0 text-body">
          이 사이트에 올라온 게임이 내 저작물을 허락 없이 쓰고 있다면 신고해주세요. 접수되면 해당 게임은 바로 비공개되고,
          게임을 올린 사람에게 알려요. 올린 사람은 30일 안에 정당한 권리를 소명하며 재게시를 요청할 수 있고, 그 경우
          재게시 예정일을 메일로 알려드려요.
        </p>
      </div>
      <CopyrightForm defaultGame={game ?? ""} />
    </div>
  );
}
