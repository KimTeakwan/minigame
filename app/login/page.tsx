import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginForm from "@/components/auth/LoginForm";

type SearchParams = Promise<{ next?: string; error?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { next, error } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(safeNext);

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-6 py-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="m-0 font-display text-[34px] font-normal">[사이트 이름]</h1>
        <p className="m-0 text-muted">AI로 만든 미니게임을 올리고 같이 노는 곳. 게임을 하려면 가입이 필요해요.</p>
      </div>
      {error && (
        <p role="alert" className="m-0 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-ink">
          로그인하지 못했어요. 다시 시도해주세요.
        </p>
      )}
      <LoginForm next={safeNext} />
    </div>
  );
}
