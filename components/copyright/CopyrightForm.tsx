"use client";

import { useActionState } from "react";
import { fileCopyrightClaim, type ClaimState } from "@/app/copyright/actions";

const input = "h-11 rounded-[10px] border border-line-strong bg-surface px-3";

export default function CopyrightForm({ defaultGame }: { defaultGame: string }) {
  const [state, action, pending] = useActionState<ClaimState, FormData>(fileCopyrightClaim, { ok: false, message: null });

  if (state.ok) {
    return (
      <p role="status" className="m-0 rounded-xl border border-line bg-surface p-8 text-center">
        신고가 접수됐어요. 해당 게임은 비공개 처리됐고, 이후 진행 상황은 적어주신 메일로 알려드려요.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
      <Field id="game" label="신고할 게임 주소 또는 ID">
        <input id="game" name="game" required defaultValue={defaultGame} placeholder="https://.../games/..." className={input} />
      </Field>
      <Field id="name" label="권리자 이름 (회사명)">
        <input id="name" name="name" required className={input} />
      </Field>
      <Field id="email" label="연락받을 이메일">
        <input id="email" name="email" type="email" required className={input} />
      </Field>
      <Field id="work" label="침해당한 저작물과 침해 내용">
        <textarea id="work" name="work" required rows={5} placeholder="어떤 저작물인지, 게임의 어느 부분이 침해하는지 적어주세요" className="rounded-[10px] border border-line-strong p-3" />
      </Field>
      <Field id="evidence" label="권리를 증명할 자료 주소 (선택)">
        <input id="evidence" name="evidence" type="url" className={input} />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" required className="mt-0.5 h-5 w-5 accent-accent" />
        <span>
          제가 이 저작물의 권리자이거나 권리자의 대리인이에요. 정당한 권리 없이 게시 중단을 요청하면 그로 인한 손해를 배상해야
          한다는 점을 알고 있어요 (저작권법 제103조 제6항).
        </span>
      </label>
      {state.message && (
        <p role="alert" className="m-0 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-ink">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="h-12 rounded-full bg-accent font-bold text-white disabled:opacity-60">
        신고 접수
      </button>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      {children}
    </div>
  );
}
