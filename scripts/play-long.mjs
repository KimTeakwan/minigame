// 긴 게임(5~10분, 스테이지·보스가 있는 게임)을 시간 빨리 감기로 끝까지 돌려봐요.
// 사이트와 같은 조건(별도 도메인 + sandbox iframe)에서 Playwright의 가짜 시계로 게임 안 시간을 빨리 감아요.
//
// 사용법: node scripts/play-long.mjs games/<slug> [옵션]
//   --size 800x600     화면 크기 (기본 800x600)
//   --seconds 600      게임 안 시간으로 최대 몇 초까지 돌릴지 (기본 600). 게임 오버가 나면 거기서 멈춰요
//   --every 20         게임 안 시간 몇 초마다 스크린샷을 찍을지 (기본 20)
//   --stage 3          시작하자마자 window.__studio.stage(3)을 불러 그 스테이지부터 봐요 (게임에 손잡이가 있을 때)
//   --input random     무작위로 방향키·스페이스·탭을 눌러요 (기본). none이면 아무것도 안 눌러요
//   --out <폴더>        스크린샷 저장 위치 (기본 /tmp/game-long/<slug>)
// 출력: 스크린샷 목록, 시간별 window.__studio.info() 값, SDK 메시지(점수 전송·새 판), 콘솔 오류
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, resolve, basename, extname } from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const dirArg = args.find((a, i) => !a.startsWith("--") && (i === 0 || !args[i - 1].startsWith("--")));
if (!dirArg) { console.error("사용법: node scripts/play-long.mjs games/<slug> [--size 800x600] [--seconds 600] [--every 20] [--stage N] [--input random|none]"); process.exit(2); }
const dir = resolve(dirArg), slug = basename(dir);
if (!existsSync(join(dir, "index.html"))) { console.error(`index.html이 없어요: ${dir}`); process.exit(2); }
const [vw, vh] = opt("size", "800x600").split("x").map(Number);
const maxSec = Number(opt("seconds", "600")), every = Number(opt("every", "20")), startStage = opt("stage", "");
const input = opt("input", "random");
const outDir = resolve(opt("out", join("/tmp/game-long", slug)));
mkdirSync(outDir, { recursive: true });

const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".png": "image/png" };
const listen = (server) => new Promise((res) => server.listen(0, "127.0.0.1", () => res(server.address().port)));
const gameServer = createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
  const path = join(dir, name);
  if (!path.startsWith(dir) || !existsSync(path) || statSync(path).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "application/octet-stream" }).end(readFileSync(path));
});
const gamePort = await listen(gameServer);
const gameOrigin = `http://localhost:${gamePort}`;
const hostHtml = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden}iframe{border:0;width:100vw;height:100vh;display:block}</style>
<iframe id="g" sandbox="allow-scripts allow-pointer-lock" src="${gameOrigin}/index.html"></iframe>
<script>window.__sdk=[];addEventListener("message",e=>{if(e.source!==document.getElementById("g").contentWindow)return;const m=e.data;if(m&&typeof m.type==="string")__sdk.push(m.type+(m.score!==undefined?":"+m.score:""));});</script>`;
const hostServer = createServer((req, res) => res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(hostHtml));
const hostPort = await listen(hostServer);

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: { width: vw, height: vh } });
await context.clock.install(); // 게임 안 시간(performance.now, requestAnimationFrame, setTimeout)을 이 스크립트가 움직여요
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${hostPort}/`, { waitUntil: "load" });
await page.clock.runFor(1500);
const frame = () => page.frames().find((f) => f.url().startsWith(gameOrigin));
const info = async () => { try { return await frame().evaluate(() => (window.__studio && window.__studio.info ? window.__studio.info() : null)); } catch { return null; } };
const sdk = () => page.evaluate(() => window.__sdk.slice());

await page.mouse.click(vw / 2, vh / 2); // 시작 (탭)
await page.clock.runFor(300);
if (startStage) {
  const ok = await frame().evaluate((n) => { if (!window.__studio || !window.__studio.stage) return false; window.__studio.stage(n); return true; }, Number(startStage));
  console.log(ok ? `· ${startStage}스테이지부터 시작했어요` : "· window.__studio.stage가 없어서 처음부터 봐요");
}

const KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "];
const shots = [], timeline = [];
let t = 0, ended = false;
const chunk = 0.25; // 0.25초씩 진행하며 입력해요
while (t < maxSec && !ended) {
  const target = Math.min(maxSec, t + every);
  while (t < target - 1e-9) {
    if (input === "random") {
      const r = Math.random();
      if (r < 0.35) { const k = KEYS[Math.floor(Math.random() * KEYS.length)]; await page.keyboard.down(k); await page.clock.runFor(120); await page.keyboard.up(k); t += 0.12; }
      else if (r < 0.55) { await page.mouse.click(Math.random() * vw, vh * 0.2 + Math.random() * vh * 0.75); }
    }
    await page.clock.runFor(chunk * 1000); t += chunk;
    if ((await sdk()).some((m) => m.startsWith("GAMESDK_SCORE"))) { ended = true; break; }
  }
  const file = join(outDir, `t${String(Math.round(t)).padStart(4, "0")}s.png`);
  await page.screenshot({ path: file }); shots.push(file);
  timeline.push({ t: Math.round(t), info: await info() });
}
if (ended) {
  await page.clock.runFor(1500);
  const file = join(outDir, "end.png"); await page.screenshot({ path: file }); shots.push(file);
  await page.mouse.click(vw / 2, vh / 2); await page.clock.runFor(800); // 다시 하기
  timeline.push({ t: "다시 하기 뒤", info: await info() });
}

const msgs = await sdk();
console.log(`\n긴 플레이: ${slug} (${vw}×${vh}, 입력 ${input})`);
console.log(`게임 안 시간 ${Math.round(t)}초 ${ended ? "— 게임 오버(점수 전송) 확인" : "— 게임 오버까지 못 감"}`);
console.log(`SDK 메시지: ${msgs.length ? msgs.join(", ") : "없음"}`);
for (const row of timeline) console.log(`  ${row.t}${typeof row.t === "number" ? "초" : ""}: ${row.info ? JSON.stringify(row.info) : "(window.__studio.info 없음)"}`);
console.log(`콘솔 오류: ${errors.length ? [...new Set(errors)].slice(0, 5).join(" / ") : "없음"}`);
console.log(`스크린샷 ${shots.length}장: ${outDir}`);
await browser.close(); gameServer.close(); hostServer.close();

async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  try {
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    return await import(pathToFileURL(join(root, "playwright", "index.mjs")).href);
  } catch {}
  throw new Error("Playwright가 없어요. `npm i -g playwright && npx playwright install chromium`으로 설치해요");
}
