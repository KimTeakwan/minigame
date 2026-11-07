import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingForm from "@/components/auth/OnboardingForm";

// 처음 로그인한 사람(특히 카카오·구글)이 닉네임을 정하고 만 14세 이상인지 확인하는 곳
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("nickname,age_confirmed").eq("id", user.id).maybeSingle();
  if (profile?.nickname && profile.age_confirmed) redirect("/");

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-6 py-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="m-0 text-[28px] font-black">거의 다 됐어요</h1>
        <p className="m-0 text-muted">다른 사람들에게 보일 닉네임을 정해주세요.</p>
      </div>
      <OnboardingForm defaultNickname={profile?.nickname ?? ""} />
    </div>
  );
}
