// 자동 검수 워커
// 검사 대기(pending) 중인 업로드를 꺼내서 확인하고, 통과하면 공개 위치로 옮겨 게임을 공개해요.
//
// 실행:  npm run worker          (대기 중인 것 한 번 처리하고 끝)
//        npm run worker -- --watch (30초마다 계속 확인)
//
// 지금 하는 검사: 파일 형식·용량, index.html 존재, 경로 조작 차단, 위험한 코드 패턴 검사
// 아직 없는 검사: 실제 브라우저로 켜보는 실행 테스트, 썸네일 자동 캡처 (README의 "다음 단계" 참고)

import { createClient } from "@supabase/supabase-js";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { unzipSync } from "fflate";

const env = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`.env.local 에 ${name} 이(가) 없어요`);
  return v;
};

const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY") },
});
const BUCKET = env("R2_BUCKET");

const MAX_UNZIPPED_BYTES = 150 * 1024 * 1024;
const MAX_FILES = 1000;

// 게임에서 나오면 안 되는 코드 패턴. 걸리면 검사 실패로 처리하고 사유를 알려줘요.
const DANGEROUS = [
  { re: /document\.cookie/i, why: "쿠키에 접근하는 코드가 있어요" },
  { re: /(top|parent)\.location\s*(=|\.href\s*=|\.replace|\.assign)/i, why: "바깥 페이지를 다른 곳으로 보내는 코드가 있어요" },
  { re: /<form[^>]+action\s*=\s*["']https?:/i, why: "외부 사이트로 정보를 보내는 입력 양식이 있어요" },
  { re: /(eval|Function)\s*\(\s*atob\s*\(/i, why: "숨겨진 코드를 실행하는 부분이 있어요" },
  { re: /coinhive|cryptonight|coin-hive|webminer/i, why: "채굴 코드로 보이는 부분이 있어요" },
];

const CONTENT_TYPES = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", js: "text/javascript", mjs: "text/javascript",
  css: "text/css", json: "application/json", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", wasm: "application/wasm", txt: "text/plain; charset=utf-8",
};
const typeOf = (path) => CONTENT_TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

async function download(key) {
  const res = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return new Uint8Array(await res.Body.transformToByteArray());
}

// 업로드 파일 → { "index.html": bytes, "assets/a.png": bytes, ... }
function extract(key, bytes) {
  if (/\.html?$/i.test(key)) return { "index.html": bytes };

  let files;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("zip 파일을 열 수 없어요");
  }

  const entries = Object.entries(files).filter(([p]) => !p.endsWith("/") && !p.startsWith("__MACOSX/") && !p.endsWith(".DS_Store"));
  if (entries.length > MAX_FILES) throw new Error(`파일이 너무 많아요 (최대 ${MAX_FILES}개)`);
  const total = entries.reduce((s, [, b]) => s + b.length, 0);
  if (total > MAX_UNZIPPED_BYTES) throw new Error("압축을 푼 크기가 너무 커요");

  for (const [p] of entries) {
    if (p.includes("..") || p.startsWith("/") || p.includes("\\")) throw new Error("잘못된 파일 경로가 있어요");
  }

  let map = Object.fromEntries(entries);
  // 폴더째 압축한 경우 (game/index.html) 맨 위 폴더를 벗겨요
  if (!map["index.html"]) {
    const tops = new Set(entries.map(([p]) => p.split("/")[0]));
    const [only] = [...tops];
    if (tops.size === 1 && map[`${only}/index.html`]) {
      map = Object.fromEntries(entries.map(([p, b]) => [p.slice(only.length + 1), b]));
    }
  }
  if (!map["index.html"]) throw new Error("zip 맨 위에 index.html이 없어요");
  return map;
}

function scan(files) {
  const decoder = new TextDecoder();
  for (const [path, bytes] of Object.entries(files)) {
    if (!/\.(html?|js|mjs)$/i.test(path)) continue;
    const text = decoder.decode(bytes);
    for (const rule of DANGEROUS) {
      if (rule.re.test(text)) throw new Error(`${rule.why} (${path})`);
    }
  }
}

async function publish(gameId, version, files) {
  const prefix = `games/${gameId}/v${version}`;
  for (const [path, bytes] of Object.entries(files)) {
    await r2.send(
      new PutObjectCommand({ Bucket: BUCKET, Key: `${prefix}/${path}`, Body: bytes, ContentType: typeOf(path), CacheControl: "public, max-age=3600" }),
    );
  }
  return prefix;
}

async function processOne(v) {
  const { data: game } = await supabase.from("games").select("id,uploader_id,status").eq("id", v.game_id).single();
  console.log(`· ${v.game_id} v${v.version_number} 검사 시작`);
  try {
    const files = extract(v.upload_key, await download(v.upload_key));
    scan(files);
    const storagePath = await publish(v.game_id, v.version_number, files);

    await supabase.from("game_versions").update({ status: "passed", reviewed_at: new Date().toISOString() }).eq("id", v.id);
    // 신고·저작권 때문에 내려간 게임은 새 버전이 통과해도 공개 상태로 돌리지 않아요
    const nextStatus = ["pending", "published", "rejected", "uploading"].includes(game.status) ? "published" : game.status;
    await supabase
      .from("games")
      .update({ storage_path: storagePath, current_version: v.version_number, status: nextStatus, reject_reason: null, updated_at: new Date().toISOString() })
      .eq("id", v.game_id);
    await supabase.from("notifications").insert({ user_id: game.uploader_id, type: "review_passed", game_id: v.game_id });
    console.log(`  ✓ 통과 → ${storagePath}`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await supabase.from("game_versions").update({ status: "rejected", reject_reason: reason, reviewed_at: new Date().toISOString() }).eq("id", v.id);
    if (["pending", "uploading"].includes(game.status)) {
      await supabase.from("games").update({ status: "rejected", reject_reason: reason }).eq("id", v.game_id);
    }
    await supabase.from("notifications").insert({ user_id: game.uploader_id, type: "review_failed", game_id: v.game_id, message: reason });
    console.log(`  ✗ 실패: ${reason}`);
  }
}

async function runOnce() {
  const { data, error } = await supabase
    .from("game_versions")
    .select("id,game_id,version_number,upload_key")
    .eq("status", "pending")
    .order("created_at")
    .limit(20);
  if (error) throw error;
  if (!data.length) {
    console.log("검사할 업로드가 없어요");
    return;
  }
  for (const v of data) await processOne(v);
}

if (process.argv.includes("--watch")) {
  console.log("30초마다 검사 대기열을 확인해요 (멈추려면 Ctrl+C)");
  for (;;) {
    await runOnce().catch((e) => console.error(e));
    await new Promise((r) => setTimeout(r, 30_000));
  }
} else {
  await runOnce();
}
