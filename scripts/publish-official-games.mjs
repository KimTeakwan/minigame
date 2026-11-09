// 공식 게임 올리기
// games/ 폴더에 있는데 아직 사이트에 없는 게임을 공식 계정으로 업로드해요.
// 일반 회원과 똑같은 경로(create_game_upload → R2 업로드 → complete_game_upload)를 써서
// 하루 5개 제한과 검수 워커 검사를 그대로 거쳐요. service_role 키는 쓰지 않아요.
//
// GitHub Actions(.github/workflows/official-games.yml)가 main에 게임이 합쳐질 때와 매일 한 번 실행해요.
// 직접 실행:  node --env-file=.env.local scripts/publish-official-games.mjs
//
// 필요한 값 (GitHub 저장소 Settings > Secrets and variables > Actions > Repository secrets):
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
//   OFFICIAL_ACCOUNT_EMAIL, OFFICIAL_ACCOUNT_PASSWORD   (공식 계정 로그인 정보)
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, NEXT_PUBLIC_GAME_ORIGIN

import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync, readdirSync, existsSync, statSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { DANGEROUS, OFFICIAL_RULES, validateGameJson, scanText } from "./lib/game-rules.mjs";

const NEEDED = [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "OFFICIAL_ACCOUNT_EMAIL", "OFFICIAL_ACCOUNT_PASSWORD",
  "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "NEXT_PUBLIC_GAME_ORIGIN",
];
const GAMES_DIR = "games";

const summary = [];
const log = (line) => {
  console.log(line);
  summary.push(line);
};
const finish = (code) => {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## 공식 게임 올리기\n\n${summary.map((l) => `- ${l}`).join("\n")}\n`);
  process.exit(code);
};

// 사이트 설정이 끝나기 전에는 실패로 표시하지 않고 건너뛰어요
const missing = NEEDED.filter((k) => !process.env[k]);
if (missing.length) {
  console.log(`::warning::설정이 아직 없어서 건너뛰어요: ${missing.join(", ")} (README의 "공식 게임" 참고)`);
  log(`설정이 아직 없어서 건너뛰었어요: ${missing.join(", ")}`);
  finish(0);
}

const env = (k) => process.env[k];
const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY") },
});
const BUCKET = env("R2_BUCKET");
const GAME_ORIGIN = env("NEXT_PUBLIC_GAME_ORIGIN").replace(/\/+$/, "");

// 1. 공식 계정으로 로그인
const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
  email: env("OFFICIAL_ACCOUNT_EMAIL"),
  password: env("OFFICIAL_ACCOUNT_PASSWORD"),
});
if (authError) {
  log(`공식 계정으로 로그인하지 못했어요: ${authError.message}`);
  finish(1);
}
const me = auth.user.id;

const { data: profile, error: profileError } = await supabase.from("profiles").select("nickname,is_official").eq("id", me).single();
if (profileError) {
  log(`공식 계정 프로필을 읽지 못했어요: ${profileError.message}`);
  finish(1);
}
if (!profile.nickname) {
  log("공식 계정이 가입 마무리(닉네임·나이 확인)를 아직 안 했어요. 사이트에서 이 계정으로 한 번 로그인해서 마쳐주세요");
  finish(1);
}
if (!profile.is_official) {
  log(`'${profile.nickname}' 계정에 공식 표시가 없어요. Supabase SQL Editor에서 is_official을 true로 바꿔주세요 (README 참고)`);
  finish(1);
}

// 2. 이미 올린 게임과 카테고리 목록
const { data: mine, error: mineError } = await supabase.from("games").select("id,title,status").eq("uploader_id", me);
if (mineError) {
  log(`올린 게임 목록을 읽지 못했어요: ${mineError.message}`);
  finish(1);
}
const byTitle = new Map(mine.map((g) => [g.title, g]));

const { data: categories } = await supabase.from("categories").select("id,name");
const categoryId = new Map((categories ?? []).map((c) => [c.name, c.id]));

// 3. games/ 폴더의 게임을 처음 추가된 순서대로
const firstAdded = (slug) => {
  try {
    const out = execFileSync("git", ["log", "--diff-filter=A", "--format=%ct", "--", `${GAMES_DIR}/${slug}/game.json`], { encoding: "utf8" });
    const times = out.trim().split("\n").filter(Boolean);
    return Number(times.at(-1) ?? Infinity);
  } catch {
    return Infinity;
  }
};
const slugs = readdirSync(GAMES_DIR)
  .filter((s) => !s.startsWith("_") && !s.startsWith(".") && statSync(join(GAMES_DIR, s)).isDirectory())
  .filter((s) => existsSync(join(GAMES_DIR, s, "game.json")) && existsSync(join(GAMES_DIR, s, "index.html")))
  .sort((a, b) => firstAdded(a) - firstAdded(b) || a.localeCompare(b));

let uploaded = 0;
let hadError = false;

for (const slug of slugs) {
  const dir = join(GAMES_DIR, slug);
  const meta = JSON.parse(readFileSync(join(dir, "game.json"), "utf8"));
  const existing = byTitle.get(meta.title);

  // 이미 올라가 있어요. 사이트에서 삭제한 게임도 다시 올리지 않아요 (완전히 빼려면 저장소에서 폴더를 지워요)
  if (existing && existing.status !== "uploading") {
    if (existing.status === "rejected") log(`${meta.title}: 사이트 검수에서 실패했어요. 공식 계정 알림에서 사유를 확인해요`);
    continue;
  }

  const html = readFileSync(join(dir, "index.html"));
  const problems = [...validateGameJson(meta), ...scanText(html.toString("utf8"), [...DANGEROUS, ...OFFICIAL_RULES])];
  if (!categoryId.has(meta.category)) problems.push(`사이트에 '${meta.category}' 카테고리가 없어요`);
  if (problems.length) {
    log(`${meta.title}: 올리지 않았어요 — ${problems.join(" / ")}`);
    hadError = true;
    continue;
  }

  // 업로드 시작 (하루 개수 제한은 DB 함수가 확인해요). 지난번에 중간에 멈춘 게임이면 같은 게임의 새 버전으로 올려요.
  const { data, error } = await supabase.rpc("create_game_upload", {
    p_game_id: existing?.status === "uploading" ? existing.id : null,
    p_title: meta.title,
    p_description: meta.description,
    p_howto: meta.howto,
    p_category_id: categoryId.get(meta.category),
    p_tags: meta.tags,
    p_controls: meta.controls,
    p_ai_tool: meta.ai_tool,
    p_leaderboard: meta.leaderboard,
    p_score_order: meta.score_order,
    p_file_name: "index.html",
  });
  if (error) {
    if (error.message.includes("하루")) {
      log(`오늘 업로드 한도(하루 5개)에 걸렸어요. ${meta.title}부터는 내일 자동으로 다시 올려요`);
      break;
    }
    log(`${meta.title}: 업로드를 시작하지 못했어요 — ${error.message}`);
    hadError = true;
    continue;
  }
  const row = Array.isArray(data) ? data[0] : data;

  try {
    await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: row.upload_key, Body: html, ContentType: "text/html; charset=utf-8" }));

    // 멀티 게임이면 방 인원 설정 (혼자 하는 게임은 기본값 그대로)
    if (meta.multiplayer) {
      const { error: mpError } = await supabase.rpc("set_game_multiplayer", {
        p_game_id: row.game_id,
        p_multiplayer: true,
        p_max_players: meta.max_players,
      });
      if (mpError) throw mpError;
    }

    let thumbnailUrl = null;
    const thumbPath = join(dir, "thumbnail.png");
    if (existsSync(thumbPath)) {
      const key = `thumbnails/${row.game_id}/v${row.version_number}.png`;
      await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: readFileSync(thumbPath), ContentType: "image/png", CacheControl: "public, max-age=86400" }));
      thumbnailUrl = `${GAME_ORIGIN}/${key}`;
    }

    const { error: completeError } = await supabase.rpc("complete_game_upload", {
      p_game_id: row.game_id,
      p_version: row.version_number,
      p_thumbnail_url: thumbnailUrl,
    });
    if (completeError) throw completeError;

    log(`${meta.title}: 올렸어요 → 검수 워커가 확인하면 공개돼요`);
    uploaded++;
  } catch (e) {
    log(`${meta.title}: 파일을 올리다 멈췄어요 — ${e.message ?? e}. 다음 실행 때 다시 올려요`);
    hadError = true;
  }
}

if (!uploaded && !hadError) log("새로 올릴 게임이 없어요");
finish(hadError ? 1 : 0);
