// 공식 게임 검사
// 사이트와 같은 조건(별도 도메인 + sandbox iframe)에서 실제 브라우저로 켜보고,
// PC·휴대폰 크기에서 조작해본 뒤 통과/실패를 알려줘요.
//
// 실행:  node scripts/check-game.mjs games/<slug>
//        node scripts/check-game.mjs games/<slug> --out /tmp/check   (스크린샷 저장 위치, 기본 /tmp/game-check/<slug>)
//        node scripts/check-game.mjs games/<slug> --no-thumbnail    (thumbnail.png를 새로 찍지 않아요)
//
// 통과하면 플레이 중 화면을 games/<slug>/thumbnail.png 로 저장해요 (800×600, 카드 비율 4:3).
// 끝나면 결과를 출력하고, 통과면 종료 코드 0, 실패면 1이에요.

import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync, statSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { join, resolve, basename, extname } from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  DANGEROUS, OFFICIAL_RULES, ALLOWED_FILES, SLUG_RE, MAX_OFFICIAL_HTML_BYTES, validateGameJson, scanText,
} from "./lib/game-rules.mjs";

const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".png": "image/png" };

const args = process.argv.slice(2);
const dirArg = args.find((a) => !a.startsWith("--"));
if (!dirArg) {
  console.error("사용법: node scripts/check-game.mjs games/<slug>");
  process.exit(2);
}
const dir = resolve(dirArg);
const slug = basename(dir);
const outIdx = args.indexOf("--out");
const outDir = resolve(outIdx >= 0 ? args[outIdx + 1] : join("/tmp/game-check", slug));
const writeThumbnail = !args.includes("--no-thumbnail") && !slug.startsWith("_");
mkdirSync(outDir, { recursive: true });

const fails = [];
const warns = [];
const notes = [];
const fail = (m) => fails.push(m);
const warn = (m) => warns.push(m);

// ---------------------------------------------------------------- 1. 파일 검사
if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error(`폴더가 없어요: ${dir}`);
  process.exit(2);
}
if (!slug.startsWith("_") && !SLUG_RE.test(slug)) fail(`폴더 이름은 영어 소문자·숫자·하이픈만 돼요 (지금: ${slug})`);

const files = readdirSync(dir);
for (const f of files) if (!ALLOWED_FILES.includes(f)) fail(`허용되지 않은 파일이 있어요: ${f} (index.html, game.json, thumbnail.png만 둬요)`);

let meta = null;
if (!files.includes("game.json")) fail("game.json이 없어요");
else {
  try {
    meta = JSON.parse(readFileSync(join(dir, "game.json"), "utf8"));
    for (const e of validateGameJson(meta)) fail(`game.json: ${e}`);
  } catch {
    fail("game.json을 읽을 수 없어요 (JSON 형식 확인)");
  }
}

let html = "";
if (!files.includes("index.html")) fail("index.html이 없어요");
else {
  const size = statSync(join(dir, "index.html")).size;
  if (size > MAX_OFFICIAL_HTML_BYTES) fail(`index.html이 너무 커요 (${(size / 1024).toFixed(0)}KB, 최대 1024KB)`);
  html = readFileSync(join(dir, "index.html"), "utf8");
  for (const why of scanText(html, DANGEROUS)) fail(why);
  for (const why of scanText(html, OFFICIAL_RULES)) fail(why);
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) fail('<meta name="viewport"> 가 없어요 (휴대폰 화면 크기 맞춤)');
  if (!/<html[^>]+lang=["']ko["']/i.test(html)) warn('<html lang="ko"> 가 없어요');
  if (!/[가-힣]/.test(html)) fail("화면에 한국어 글자가 없어요");
  if (meta?.leaderboard) {
    if (!/window\.GameSDK\s*=/.test(html)) fail("리더보드 게임인데 SDK 코드가 없어요 (_template의 SDK 블록을 넣어요)");
    if (!/GameSDK\.submitScore\s*\(/.test(html)) fail("리더보드 게임인데 GameSDK.submitScore를 부르지 않아요");
    if (!/GameSDK\.newRound\s*\(/.test(html)) warn("GameSDK.newRound를 부르지 않아요 (다시 하기 때 점수를 또 보낼 수 없어요)");
  }
  if (meta?.multiplayer) {
    if (!/window\.GameSDK\s*=/.test(html) || !/GAMESDK_MP_JOIN/.test(html)) fail("멀티 게임인데 멀티 SDK 코드가 없어요 (_template의 SDK 블록을 넣어요)");
    if (!/GameSDK\.multi\.join\s*\(/.test(html)) fail("멀티 게임인데 GameSDK.multi.join을 부르지 않아요");
    if (!/\.catch\s*\(/.test(html)) warn("join 실패(.catch) 처리가 안 보여요. 사이트 밖이나 연결 실패 때 혼자 모드로 시작해야 해요");
  }
}

// ---------------------------------------------------------------- 2. 실제 브라우저 검사
const staticFailed = fails.length > 0 || !html;
let shots = {};
if (!staticFailed) {
  try {
    shots = await runBrowserChecks();
  } catch (e) {
    fail(`브라우저 검사를 실행하지 못했어요: ${e.message}`);
  }
}

// ---------------------------------------------------------------- 3. 결과
const passed = fails.length === 0;
if (passed && writeThumbnail && shots.desktopPlay) {
  copyFileSync(shots.desktopPlay, join(dir, "thumbnail.png"));
  notes.push(`thumbnail.png 저장: ${join(dirArg, "thumbnail.png")}`);
}
writeFileSync(join(outDir, "report.json"), JSON.stringify({ slug, passed, fails, warns, notes, shots }, null, 2));

console.log(`\n게임 검사: ${slug} ${meta?.title ? `(${meta.title})` : ""}`);
console.log(passed ? "결과: 통과 ✓" : "결과: 실패 ✗");
for (const m of fails) console.log(`  ✗ ${m}`);
for (const m of warns) console.log(`  ! ${m}`);
for (const m of notes) console.log(`  · ${m}`);
if (Object.keys(shots).length) console.log(`  · 스크린샷: ${outDir}`);
process.exit(passed ? 0 : 1);

// =================================================================
async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {}
  try {
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    return await import(pathToFileURL(join(root, "playwright", "index.mjs")).href);
  } catch {}
  throw new Error("Playwright가 없어요. `npm i -g playwright && npx playwright install chromium`으로 설치해요");
}

async function launchBrowser(chromium) {
  const options = [{}, { channel: "chrome" }, { executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome" }];
  let lastError;
  for (const o of options) {
    try {
      return await chromium.launch({ ...o, args: ["--autoplay-policy=no-user-gesture-required"] });
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

function listen(server, host) {
  return new Promise((res) => server.listen(0, host, () => res(server.address().port)));
}

async function runBrowserChecks() {
  const { chromium } = await loadPlaywright();

  // 게임 서버와 바깥 페이지 서버를 다른 주소(localhost vs 127.0.0.1)로 띄워서 사이트처럼 다른 도메인으로 만들어요
  const gameServer = createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
    const path = join(dir, name);
    if (!path.startsWith(dir) || !existsSync(path) || statSync(path).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(readFileSync(path));
  });
  const gamePort = await listen(gameServer, "127.0.0.1");
  const gameOrigin = `http://localhost:${gamePort}`;

  // 바깥 페이지는 games/_preview/multi.html (사이트처럼 sandbox iframe + 가짜 멀티 중계기)이에요.
  // 혼자 하는 게임은 1명으로, 멀티 게임은 1명(혼자 기다릴 때)과 2명 두 가지로 켜봐요.
  const hostHtml = readFileSync(new URL("../games/_preview/multi.html", import.meta.url), "utf8");
  const hostServer = createServer((req, res) => res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(hostHtml));
  const hostPort = await listen(hostServer, "127.0.0.1");
  const hostOrigin = `http://127.0.0.1:${hostPort}`;
  const hostUrl = (players, extra = "") =>
    `${hostOrigin}/?src=${encodeURIComponent(`${gameOrigin}/index.html`)}&players=${players}&tags=0${extra}`;

  const browser = await launchBrowser(chromium);
  const shots = {};
  const sdkMessages = [];

  const watch = (page, label) => {
    const errors = [];
    const external = new Set();
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      const u = r.url();
      if (u.startsWith(hostOrigin) || u.startsWith(gameOrigin) || /^(data|blob|about):/.test(u)) return;
      external.add(u);
    });
    return () => {
      for (const e of [...new Set(errors)].slice(0, 5)) fail(`[${label}] 오류: ${e}`);
      for (const u of [...external].slice(0, 5)) fail(`[${label}] 외부 주소에 접속해요: ${u}`);
    };
  };

  const gameFrame = (page) => page.frames().find((f) => f.url().startsWith(gameOrigin));

  const checkLayout = async (page, label) => {
    const frame = gameFrame(page);
    if (!frame) {
      fail(`[${label}] 게임 화면을 찾지 못했어요`);
      return;
    }
    const m = await frame.evaluate(() => ({
      sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
      w: window.innerWidth, h: window.innerHeight,
    }));
    if (m.sw > m.w + 1 || m.sh > m.h + 1) fail(`[${label}] 화면이 창보다 커요 (${m.sw}×${m.sh}, 창 ${m.w}×${m.h})`);
  };

  const rand = (n) => Math.floor(Math.random() * n);
  const isBlank = (buf) => buf.length < 4000; // 한 가지 색으로만 된 화면은 PNG가 아주 작아요

  // --- PC (800×600, 썸네일 비율과 같아요)
  {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
    const page = await ctx.newPage();
    const report = watch(page, "PC");
    await page.goto(hostUrl(1), { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const start = await page.screenshot({ path: join(outDir, "pc-start.png") });
    shots.desktopStart = join(outDir, "pc-start.png");
    if (isBlank(start)) fail("[PC] 시작 화면이 비어 있어요");

    await page.mouse.click(400, 300);
    await page.keyboard.press("Space");
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "Space"];
    const t0 = Date.now();
    let mid = null;
    while (Date.now() - t0 < 9000) {
      const k = keys[rand(keys.length)];
      await page.keyboard.down(k);
      await page.waitForTimeout(60 + rand(140));
      await page.keyboard.up(k);
      if (Math.random() < 0.25) await page.mouse.click(40 + rand(720), 40 + rand(520));
      // 썸네일로도 쓰는 장면이라 화면에 게임 요소가 충분히 나온 뒤(5초)에 찍어요
      if (!mid && Date.now() - t0 > 5000) {
        mid = await page.screenshot({ path: join(outDir, "pc-play.png") });
        shots.desktopPlay = join(outDir, "pc-play.png");
      }
    }
    await page.screenshot({ path: join(outDir, "pc-end.png") });
    shots.desktopEnd = join(outDir, "pc-end.png");
    if (mid && mid.equals(start)) fail("[PC] 클릭하고 키를 눌러도 화면이 바뀌지 않아요");
    await checkLayout(page, "PC");
    sdkMessages.push(...(await page.evaluate(() => window.__msgs)));
    report();
    await ctx.close();
  }

  // --- 휴대폰 세로 (390×844, 터치)
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const report = watch(page, "휴대폰 세로");
    await page.goto(hostUrl(1), { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const start = await page.screenshot({ path: join(outDir, "mobile-start.png") });
    shots.mobileStart = join(outDir, "mobile-start.png");
    if (isBlank(start)) fail("[휴대폰 세로] 시작 화면이 비어 있어요");

    await page.touchscreen.tap(195, 422);
    const t0 = Date.now();
    let mid = null;
    while (Date.now() - t0 < 7000) {
      const side = rand(3);
      await page.touchscreen.tap(side === 0 ? 60 : side === 1 ? 330 : 195, 300 + rand(450));
      await page.waitForTimeout(80 + rand(160));
      if (!mid && Date.now() - t0 > 2500) {
        mid = await page.screenshot({ path: join(outDir, "mobile-play.png") });
        shots.mobilePlay = join(outDir, "mobile-play.png");
      }
    }
    if (meta.controls !== "keyboard" && mid && mid.equals(start)) fail("[휴대폰 세로] 화면을 탭해도 반응이 없어요");
    await checkLayout(page, "휴대폰 세로");
    sdkMessages.push(...(await page.evaluate(() => window.__msgs)));
    report();
    await ctx.close();
  }

  // --- 휴대폰 가로 (844×390): 화면이 잘리지 않는지만 봐요
  {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const report = watch(page, "휴대폰 가로");
    await page.goto(hostUrl(1), { waitUntil: "load" });
    await page.waitForTimeout(1200);
    await page.touchscreen.tap(422, 195);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(outDir, "mobile-landscape.png") });
    shots.mobileLandscape = join(outDir, "mobile-landscape.png");
    await checkLayout(page, "휴대폰 가로");
    report();
    await ctx.close();
  }

  // --- 멀티 2명 (1200×600, 왼쪽·오른쪽 화면). 두 번째 사람은 3초 뒤에 들어와요.
  if (meta.multiplayer) {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 600 } });
    const page = await ctx.newPage();
    const report = watch(page, "멀티 2명");
    await page.goto(hostUrl(2, "&late=3"), { waitUntil: "load" });
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "Space", "KeyA", "KeyD", "KeyW"];
    const t0 = Date.now();
    let shot = false;
    while (Date.now() - t0 < 12000) {
      const x = rand(2) === 0 ? 40 + rand(520) : 640 + rand(520);
      await page.mouse.click(x, 40 + rand(520));
      for (let i = 0; i < 3; i++) {
        const k = keys[rand(keys.length)];
        await page.keyboard.down(k);
        await page.waitForTimeout(50 + rand(120));
        await page.keyboard.up(k);
      }
      if (!shot && Date.now() - t0 > 7000) {
        await page.screenshot({ path: join(outDir, "multi-play.png") });
        shots.multiPlay = join(outDir, "multi-play.png");
        shot = true;
      }
    }
    await page.screenshot({ path: join(outDir, "multi-end.png") });
    shots.multiEnd = join(outDir, "multi-end.png");
    const mp = await page.evaluate(() => window.__mp);
    if (mp.joins < 2) fail(`[멀티 2명] 두 사람이 모두 방에 들어오지 않았어요 (들어온 사람 ${mp.joins}명)`);
    for (const v of [...new Set(mp.violations)].slice(0, 5)) fail(`[멀티 2명] ${v}`);
    const senders = Object.keys(mp.sends).length;
    if (senders < 2) warn(`[멀티 2명] 메시지를 보낸 사람이 ${senders}명이에요. 서로 상태를 주고받는지 확인해요`);
    notes.push(`멀티 2명: 입장 ${mp.joins}명, 보낸 메시지 ${Object.values(mp.sends).reduce((a, b) => a + b, 0)}개, 전달 ${mp.delivered}개, 방 잠금 ${mp.locks}번`);
    report();
    await ctx.close();
  }

  await browser.close();
  gameServer.close();
  hostServer.close();

  const scores = sdkMessages.filter((m) => m && m.type === "GAMESDK_SCORE");
  if (meta.leaderboard) {
    if (scores.length) notes.push(`리더보드 점수 전송 확인: ${scores.map((s) => s.score).join(", ")}`);
    else warn("자동 플레이 중 점수 전송은 못 봤어요 (판이 안 끝났을 수 있어요. 코드에서 게임 오버 때 submitScore를 부르는지 확인해요)");
  } else if (scores.length) {
    warn("leaderboard가 false인데 점수를 보내요");
  }
  return shots;
}
