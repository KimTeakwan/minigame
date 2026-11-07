"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// 저작권 신고로 내려간 게임의 재게시 요청 (저작권법 제103조 제3항)
export default function RestoreRequest({ claimId }: { claimId: string }) {
  const supabase = useRef(createClient()).current;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 10) return setResult("정당한 권리가 있다는 근거를 10자 이상 적어주세요");
    const { error } = await supabase.rpc("request_copyright_restore", { p_claim_id: claimId, p_reason: reason.trim() });
    setResult(error ? error.message : "재게시 요청을 보냈어요. 처리 결과는 알림으로 알려드려요.");
    if (!error) setOpen(false);
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-1">
        <button type="button" onClick={() => setOpen(true)} className="h-9 self-start rounded-full bg-ink px-3.5 text-[13px] font-bold text-white">
          재게시 요청
        </button>
        {result && <p className="m-0 text-[13px] text-body">{result}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg bg-ground p-3">
      <label htmlFor={`restore-${claimId}`} className="text-sm font-bold">
        내가 정당한 권리를 가진 이유
      </label>
      <textarea
        id={`restore-${claimId}`}
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="예: 직접 만든 그림과 음악만 사용했어요. 원본 작업 파일을 갖고 있어요."
        className="rounded-[10px] border border-line-strong bg-surface p-3 text-sm"
      />
      <p className="m-0 text-xs text-muted">정당한 권리 없이 재게시를 요청하면 손해배상 책임을 질 수 있어요.</p>
      {result && <p className="m-0 text-[13px] text-danger">{result}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-full border border-line-strong bg-surface px-3.5 text-[13px]">
          취소
        </button>
        <button type="submit" className="h-9 rounded-full bg-ink px-3.5 text-[13px] font-bold text-white">
          요청 보내기
        </button>
      </div>
    </form>
  );
}
