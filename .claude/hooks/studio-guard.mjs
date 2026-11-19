#!/usr/bin/env node
// 게임 스튜디오 안전장치 (PreToolUse 훅, Bash 명령 실행 직전에 검사해요)
//
// 클라우드에서 도는 Claude(예약 작업 등, CLAUDE_CODE_REMOTE=true)일 때만 켜져요.
// 내 컴퓨터에서 쓰는 Claude Code에는 아무 영향이 없어요.
//
// 막는 것
//   1. main/master로 push, 강제 push(--force, -f, +refspec), 원격 브랜치 삭제
//   2. game-* 브랜치를 push할 때 games/<slug>/ 의 index.html·game.json·thumbnail.png 말고 다른 파일이 바뀐 경우
//   3. PR 병합 (gh pr merge, gh api .../pulls/<번호>/merge) — 병합은 소유자만 해요
//
// 막으면 종료 코드 2와 이유를 stderr로 내보내요. Claude는 그 이유를 보고 다른 방법을 찾아요.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

if (process.env.CLAUDE_CODE_REMOTE !== "true") process.exit(0);

let input = "";
try {
  input = await new Promise((resolve) => {
    let buf = "";
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => resolve(buf));
  });
} catch {
  process.exit(0);
}

let payload = {};
try { payload = JSON.parse(input || "{}"); } catch { process.exit(0); }
const command = String(payload?.tool_input?.command || "");
const sessionCwd = String(payload?.cwd || process.cwd());
if (!/\bgit\b|\bgh\b/.test(command)) process.exit(0);

function block(reason) {
  process.stderr.write(`[스튜디오 안전장치] ${reason}\n`);
  process.exit(2);
}

// 아주 단순한 셸 토큰 나누기 (따옴표 안의 공백은 유지)
function tokenize(s) {
  const out = [];
  let cur = "", q = null, has = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === q) q = null;
      else if (ch === "\\" && q === '"' && i + 1 < s.length) cur += s[++i];
      else cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') { q = ch; has = true; continue; }
    if (/\s/.test(ch)) { if (cur || has) out.push(cur); cur = ""; has = false; continue; }
    cur += ch; has = true;
  }
  if (cur || has) out.push(cur);
  return out;
}

// 명령을 &&, ||, ;, |, 줄바꿈으로 나눠요. cd 로 옮긴 폴더를 기억해요.
const segments = command.split(/&&|\|\||;|\||\n/).map((x) => x.trim()).filter(Boolean);
let cwd = sessionCwd;

function git(dir, args) {
  return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

const ALLOWED = /^games\/([a-z0-9][a-z0-9-]*)\/(index\.html|game\.json|thumbnail\.png)$/;

for (const seg of segments) {
  const t = tokenize(seg);
  if (!t.length) continue;

  if (t[0] === "cd" && t[1]) {
    const target = t[1].startsWith("/") ? t[1] : `${cwd}/${t[1]}`;
    if (existsSync(target)) cwd = target;
    continue;
  }

  // ---- gh: PR 병합 막기
  if (t[0] === "gh") {
    if (t[1] === "pr" && t[2] === "merge") block("PR 병합은 소유자만 해요. 병합하지 말고 요약에 적어주세요.");
    if (t[1] === "api" && t.some((x) => /\/pulls\/\d+\/merge\b/.test(x))) block("PR 병합 API는 쓸 수 없어요. 병합은 소유자만 해요.");
    continue;
  }

  // ---- git push 검사
  if (t[0] !== "git") continue;
  let i = 1, dir = cwd;
  while (i < t.length && t[i].startsWith("-")) {
    if (t[i] === "-C" && t[i + 1]) { dir = t[i + 1].startsWith("/") ? t[i + 1] : `${cwd}/${t[i + 1]}`; i += 2; continue; }
    if (t[i] === "-c" && t[i + 1]) { i += 2; continue; }
    i++;
  }
  if (t[i] !== "push") continue;
  const args = t.slice(i + 1);

  const flags = args.filter((a) => a.startsWith("-"));
  const positional = args.filter((a) => !a.startsWith("-"));
  if (flags.some((f) => /^(--force|--force-with-lease|--force-if-includes|--mirror|--delete|--prune|-[a-zA-Z]*[fd][a-zA-Z]*)(=|$)/.test(f)))
    block("강제 push·삭제·mirror push는 쓸 수 없어요. 새 커밋을 쌓아서 일반 push로 올려주세요.");

  const refspecs = positional.slice(1); // 첫 번째는 원격 이름(origin)
  if (refspecs.some((r) => r.startsWith("+"))) block("+refspec(강제 push)은 쓸 수 없어요.");
  if (refspecs.some((r) => r.startsWith(":"))) block("원격 브랜치 삭제는 쓸 수 없어요.");

  const targets = refspecs.map((r) => (r.includes(":") ? r.split(":").pop() : r).replace(/^refs\/heads\//, ""));
  if (targets.some((r) => r === "main" || r === "master")) block("main에는 직접 push할 수 없어요. game-<slug>-<날짜> 브랜치로 올리고 PR을 열어주세요.");

  // refspec 없이 push하면 지금 브랜치가 올라가요
  let current = "";
  try { current = git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]); } catch {}
  if (!refspecs.length && (current === "main" || current === "master")) block("main 브랜치에서 그냥 push하면 main으로 올라가요. game-* 브랜치에서 push해주세요.");
  if (refspecs.some((r) => r === "HEAD" || r.startsWith("HEAD:")) && (current === "main" || current === "master") && !targets.some((x) => x.startsWith("game-")))
    block("main 브랜치의 HEAD를 push할 수 없어요.");

  // game-* 브랜치면 바뀐 파일을 확인해요
  const gameBranches = [];
  for (const r of refspecs) {
    const src = r.includes(":") ? r.split(":")[0] : r;
    const dst = r.includes(":") ? r.split(":").pop() : r;
    if (dst.startsWith("game-")) gameBranches.push(src === "HEAD" || src === "" ? current : src);
  }
  if (!refspecs.length && current.startsWith("game-")) gameBranches.push(current);

  for (const br of gameBranches) {
    let files;
    try {
      files = git(dir, ["diff", "--name-only", `origin/main...${br}`]).split("\n").filter(Boolean);
    } catch {
      block(`${br}의 바뀐 파일을 확인하지 못했어요. 'git fetch origin main' 후 다시 push해주세요.`);
    }
    const bad = files.filter((f) => !ALLOWED.test(f));
    const slugs = new Set(files.map((f) => (f.match(ALLOWED) || [])[1]).filter(Boolean));
    if (bad.length) block(`게임 브랜치에는 games/<slug>/ 의 index.html·game.json·thumbnail.png만 올릴 수 있어요. 규칙 밖 파일: ${bad.slice(0, 10).join(", ")}`);
    if (slugs.size > 1) block(`게임 브랜치 하나에는 게임 하나만 올려요. 바뀐 게임 폴더: ${[...slugs].join(", ")}`);
  }
}

process.exit(0);
