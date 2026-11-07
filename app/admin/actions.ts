"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// 관리자 작업. 권한 확인은 DB 함수 안(is_admin)에서도 한 번 더 해요.

export async function resolveGameReports(formData: FormData) {
  const supabase = await createClient();
  await supabase.rpc("admin_resolve_game_reports", {
    p_game_id: String(formData.get("gameId")),
    p_remove: formData.get("remove") === "true",
  });
  revalidatePath("/admin");
}

export async function resolveCommentReports(formData: FormData) {
  const supabase = await createClient();
  await supabase.rpc("admin_resolve_comment_reports", {
    p_comment_id: String(formData.get("commentId")),
    p_remove: formData.get("remove") === "true",
  });
  revalidatePath("/admin");
}

export async function updateCopyrightClaim(formData: FormData) {
  const supabase = await createClient();
  const due = String(formData.get("due") ?? "");
  await supabase.rpc("admin_update_copyright_claim", {
    p_claim_id: String(formData.get("claimId")),
    p_status: String(formData.get("status")),
    p_due: due || null,
  });
  revalidatePath("/admin");
}

export async function setUserStatus(formData: FormData) {
  const supabase = await createClient();
  const status = String(formData.get("status"));
  const until = status === "suspended" ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null;
  await supabase.rpc("admin_set_user_status", {
    p_user_id: String(formData.get("userId")),
    p_status: status,
    p_until: until,
  });
  revalidatePath("/admin");
}

export async function addCategory(formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const { data } = await supabase.from("categories").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const next = ((data?.[0]?.sort_order as number | undefined) ?? 0) + 1;
  await supabase.from("categories").insert({ name, sort_order: next });
  revalidatePath("/admin");
}

export async function renameCategory(formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await supabase.from("categories").update({ name }).eq("id", Number(formData.get("id")));
  revalidatePath("/admin");
}

export async function moveCategory(formData: FormData) {
  const supabase = await createClient();
  const id = Number(formData.get("id"));
  const direction = formData.get("direction") === "up" ? "up" : "down";
  const { data } = await supabase.from("categories").select("id,sort_order").order("sort_order");
  const list = (data ?? []) as { id: number; sort_order: number }[];
  const i = list.findIndex((c) => c.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return;
  await supabase.from("categories").update({ sort_order: list[j].sort_order }).eq("id", list[i].id);
  await supabase.from("categories").update({ sort_order: list[i].sort_order }).eq("id", list[j].id);
  revalidatePath("/admin");
}
