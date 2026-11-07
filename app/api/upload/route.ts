import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createUploadUrl } from "@/lib/r2";
import { MAX_GAME_FILE_BYTES, MAX_THUMBNAIL_BYTES } from "@/lib/constants";

type Body = {
  gameId: string | null;
  title: string;
  description: string | null;
  howto: string | null;
  categoryId: number;
  tags: string[];
  controls: "keyboard" | "touch" | "both";
  aiTool: string | null;
  leaderboard: boolean;
  scoreOrder: "asc" | "desc";
  file: { name: string; size: number; type: string };
  thumbnail: { name: string; size: number; type: string } | null;
};

// 업로드 1단계: 게임 정보 저장 + 브라우저가 R2에 바로 올릴 주소 발급
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });

  const body = (await request.json()) as Body;

  const title = String(body.title ?? "").trim();
  if (!title || title.length > 60) return bad("제목은 1~60자로 적어주세요");
  if (!["keyboard", "touch", "both"].includes(body.controls)) return bad("조작 방식을 골라주세요");
  if (!body.file || !/\.(zip|html?)$/i.test(body.file.name)) return bad("zip 또는 HTML 파일만 올릴 수 있어요");
  if (body.file.size <= 0 || body.file.size > MAX_GAME_FILE_BYTES) return bad("파일은 50MB까지 올릴 수 있어요");
  if (!["application/zip", "text/html"].includes(body.file.type)) return bad("파일 형식이 올바르지 않아요");
  if (body.thumbnail) {
    if (!/^image\/(png|jpeg|webp)$/.test(body.thumbnail.type)) return bad("썸네일은 PNG, JPG, WEBP만 돼요");
    if (body.thumbnail.size > MAX_THUMBNAIL_BYTES) return bad("썸네일은 5MB까지예요");
  }

  // 하루 개수 제한·계정 정지 확인과 DB 저장은 DB 함수 안에서 한 번에 해요 (supabase/migrations/)
  const { data, error } = await supabase.rpc("create_game_upload", {
    p_game_id: body.gameId,
    p_title: title,
    p_description: body.description || null,
    p_howto: body.howto || null,
    p_category_id: body.categoryId,
    p_tags: (body.tags ?? []).slice(0, 10).map((t) => String(t).slice(0, 20)),
    p_controls: body.controls,
    p_ai_tool: body.aiTool || null,
    p_leaderboard: !!body.leaderboard,
    p_score_order: body.scoreOrder === "asc" ? "asc" : "desc",
    p_file_name: body.file.name,
  });
  if (error) return bad(error.message);

  const row = (Array.isArray(data) ? data[0] : data) as { game_id: string; version_number: number; upload_key: string };

  const uploadUrl = await createUploadUrl(row.upload_key, body.file.type, body.file.size);

  let thumbnailUploadUrl: string | null = null;
  let thumbnailPublicUrl: string | null = null;
  if (body.thumbnail) {
    const ext = body.thumbnail.type.split("/")[1].replace("jpeg", "jpg");
    const key = `thumbnails/${row.game_id}/v${row.version_number}.${ext}`;
    thumbnailUploadUrl = await createUploadUrl(key, body.thumbnail.type, body.thumbnail.size);
    thumbnailPublicUrl = `${process.env.NEXT_PUBLIC_GAME_ORIGIN}/${key}`;
  }

  return NextResponse.json({
    gameId: row.game_id,
    version: row.version_number,
    uploadUrl,
    thumbnailUploadUrl,
    thumbnailPublicUrl,
  });
}

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
