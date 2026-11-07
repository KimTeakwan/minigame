"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ProfileEditor({ nickname, bio }: { nickname: string; bio: string }) {
  const router = useRouter();
  const supabase = useRef(createClient()).current;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const nextNickname = String(form.get("nickname") ?? "").trim();
    const nextBio = String(form.get("bio") ?? "").trim();
    if (nextNickname.length < 2 || nextNickname.length > 20) return setError("닉네임은 2~20자예요");

    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("profiles")
      .update({ nickname: nextNickname, bio: nextBio || null })
      .eq("id", auth.user?.id);
    if (error) return setError(error.code === "23505" ? "이미 쓰는 닉네임이에요" : "저장하지 못했어요");

    setOpen(false);
    if (nextNickname !== nickname) router.push(`/users/${encodeURIComponent(nextNickname)}`);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-11 rounded-full border border-line-strong bg-surface px-[18px] text-sm font-bold">
        프로필 수정
      </button>
    );
  }

  return (
    <form onSubmit={save} className="flex w-full flex-col gap-2 rounded-xl border border-line bg-ground p-4">
      <label htmlFor="edit-nickname" className="text-sm font-bold">
        닉네임
      </label>
      <input id="edit-nickname" name="nickname" defaultValue={nickname} maxLength={20} className="h-11 rounded-[10px] border border-line-strong bg-surface px-3" />
      <label htmlFor="edit-bio" className="text-sm font-bold">
        자기소개
      </label>
      <textarea id="edit-bio" name="bio" defaultValue={bio} maxLength={200} rows={3} className="rounded-[10px] border border-line-strong bg-surface p-3" />
      {error && <p className="m-0 text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-full border border-line-strong bg-surface px-4 text-sm">
          취소
        </button>
        <button type="submit" className="h-10 rounded-full bg-ink px-4 text-sm font-bold text-white">
          저장
        </button>
      </div>
    </form>
  );
}
