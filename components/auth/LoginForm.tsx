"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const supabase = useRef(createClient()).current;
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [over14, setOver14] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setMessage(null);

    if (mode === "signup") {
      if (!over14) return setMessage("만 14세 이상만 가입할 수 있어요");
      if (password.length < 8) return setMessage("비밀번호는 8자 이상이에요");
      setBusy(true);
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callback() } });
      setBusy(false);
      setMessage(error ? "가입하지 못했어요. 이미 가입한 이메일인지 확인해주세요." : "메일함에서 인증 링크를 눌러 가입을 마쳐주세요.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setMessage("이메일 또는 비밀번호가 맞지 않아요");
    router.push(next);
    router.refresh();
  }

  async function social(provider: "kakao" | "google") {
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: callback() } });
  }

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6">
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => social("kakao")} className="h-12 rounded-xl bg-[#FEE500] font-bold text-[#191919]">
          카카오로 시작하기
        </button>
        <button type="button" onClick={() => social("google")} className="h-12 rounded-xl border border-line-strong bg-surface font-bold text-ink">
          구글로 시작하기
        </button>
      </div>

      <div className="flex items-center gap-3 text-[13px] text-muted">
        <span className="h-px flex-1 bg-line" />
        또는 이메일로
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="email" className="text-sm font-bold">
          이메일
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className="h-11 rounded-[10px] border border-line-strong px-3" />
        <label htmlFor="password" className="text-sm font-bold">
          비밀번호
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className="h-11 rounded-[10px] border border-line-strong px-3"
        />
        {mode === "signup" && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={over14} onChange={(e) => setOver14(e.target.checked)} className="mt-0.5 h-5 w-5 accent-accent" />
            <span>
              만 14세 이상이에요. 가입하면 <Link href="/legal/terms" className="underline">이용약관</Link>과{" "}
              <Link href="/legal/privacy" className="underline">개인정보처리방침</Link>에 동의하는 것으로 봐요.
            </span>
          </label>
        )}
        {message && (
          <p role="status" className="m-0 rounded-lg bg-ground px-3 py-2 text-sm text-body">
            {message}
          </p>
        )}
        <button type="submit" disabled={busy} className="h-12 rounded-full bg-ink font-bold text-white disabled:opacity-60">
          {mode === "login" ? "로그인" : "가입하기"}
        </button>
      </form>

      <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(null); }} className="text-sm text-muted underline">
        {mode === "login" ? "처음이에요? 이메일로 가입하기" : "이미 가입했어요? 로그인하기"}
      </button>
    </div>
  );
}
