"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingForm({ defaultNickname }: { defaultNickname: string }) {
  const router = useRouter();
  const supabase = useRef(createClient()).current;
  const [over14, setOver14] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nickname = String(new FormData(e.currentTarget).get("nickname") ?? "").trim();
    if (nickname.length < 2 || nickname.length > 20) return setError("닉네임은 2~20자예요");
    if (!over14) return setError("만 14세 미만은 가입할 수 없어요");
    if (!agreed) return setError("약관에 동의해주세요");

    setBusy(true);
    const { error } = await supabase.rpc("complete_onboarding", { p_nickname: nickname });
    setBusy(false);
    if (error) return setError(error.code === "23505" ? "이미 쓰는 닉네임이에요" : "저장하지 못했어요");
    router.push("/");
    router.refresh();
  }

  async function quit() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
      <label htmlFor="nickname" className="text-sm font-bold">
        닉네임
      </label>
      <input id="nickname" name="nickname" defaultValue={defaultNickname} required minLength={2} maxLength={20} className="h-11 rounded-[10px] border border-line-strong px-3" />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={over14} onChange={(e) => setOver14(e.target.checked)} className="mt-0.5 h-5 w-5 accent-accent" />
        <span>만 14세 이상이에요</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 accent-accent" />
        <span>
          <Link href="/legal/terms" className="underline">이용약관</Link>, <Link href="/legal/privacy" className="underline">개인정보처리방침</Link>,{" "}
          <Link href="/legal/content-policy" className="underline">콘텐츠 정책</Link>에 동의해요
        </span>
      </label>
      {error && (
        <p role="alert" className="m-0 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-ink">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="h-12 rounded-full bg-accent font-bold text-white disabled:opacity-60">
        시작하기
      </button>
      <button type="button" onClick={quit} className="text-sm text-muted underline">
        만 14세 미만이에요 · 나가기
      </button>
    </form>
  );
}
