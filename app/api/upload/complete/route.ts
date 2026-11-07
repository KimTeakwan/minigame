import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 업로드 3단계: R2에 파일을 다 올린 뒤 호출 → 자동 검사 대기열에 들어가요
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });

  const { gameId, version, thumbnailUrl } = (await request.json()) as {
    gameId: string;
    version: number;
    thumbnailUrl: string | null;
  };

  // 썸네일 주소는 우리가 발급한 R2 주소만 받아요
  const origin = process.env.NEXT_PUBLIC_GAME_ORIGIN ?? "";
  const safeThumb = thumbnailUrl && thumbnailUrl.startsWith(`${origin}/thumbnails/${gameId}/`) ? thumbnailUrl : null;

  const { error } = await supabase.rpc("complete_game_upload", {
    p_game_id: gameId,
    p_version: version,
    p_thumbnail_url: safeThumb,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
