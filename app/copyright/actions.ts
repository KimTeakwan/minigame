"use server";

import { createClient } from "@/lib/supabase/server";

export type ClaimState = { ok: boolean; message: string | null };

export async function fileCopyrightClaim(_prev: ClaimState, formData: FormData): Promise<ClaimState> {
  const gameRef = String(formData.get("game") ?? "");
  const gameId = gameRef.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (!gameId) return { ok: false, message: "게임 주소나 ID를 다시 확인해주세요" };
  if (!formData.get("confirm")) return { ok: false, message: "확인 항목에 체크해주세요" };

  const evidence = String(formData.get("evidence") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.from("copyright_claims").insert({
    game_id: gameId,
    claimant_name: String(formData.get("name") ?? "").trim().slice(0, 100),
    claimant_email: String(formData.get("email") ?? "").trim().slice(0, 200),
    work_description: String(formData.get("work") ?? "").trim().slice(0, 4000),
    evidence_url: evidence && /^https?:\/\//.test(evidence) ? evidence.slice(0, 500) : null,
  });

  if (error) {
    return { ok: false, message: error.code === "23503" ? "해당 게임을 찾을 수 없어요" : "접수하지 못했어요. 잠시 뒤 다시 시도해주세요." };
  }
  return { ok: true, message: null };
}
