"use client";

import Link from "next/link";
import { useState } from "react";
import { AI_TOOLS, MAX_GAME_FILE_BYTES, MAX_THUMBNAIL_BYTES } from "@/lib/constants";

type Existing = {
  id: string;
  title: string;
  description: string | null;
  howto: string | null;
  category_id: number;
  tags: string[];
  controls: "keyboard" | "touch" | "both";
  ai_tool: string | null;
  leaderboard_enabled: boolean;
  score_order: "asc" | "desc";
  multiplayer: boolean;
  max_players: number;
} | null;

type Props = {
  categories: { id: number; name: string }[];
  existing: Existing;
  nickname: string;
  siteUrl: string;
};

type Step = "form" | "uploading" | "done";

const inputClass = "h-11 rounded-[10px] border border-line-strong bg-surface px-3 text-[15px]";
const textareaClass = "resize-y rounded-[10px] border border-line-strong bg-surface p-3 text-[15px]";

export default function UploadForm({ categories, existing, nickname, siteUrl }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [thumb, setThumb] = useState<File | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(existing?.category_id ?? null);
  const [controls, setControls] = useState<string | null>(existing?.controls ?? null);
  const [leaderboard, setLeaderboard] = useState(existing?.leaderboard_enabled ?? false);
  const [scoreOrder, setScoreOrder] = useState<"asc" | "desc">(existing?.score_order ?? "desc");
  const [multiplayer, setMultiplayer] = useState(existing?.multiplayer ?? false);
  const [maxPlayers, setMaxPlayers] = useState(existing?.multiplayer ? existing.max_players : 4);
  const [agreed, setAgreed] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState<string | null>(null);

  function pickFile(f: File | null) {
    setError(null);
    if (!f) return setFile(null);
    if (!/\.(zip|html?)$/i.test(f.name)) return setError("zip 또는 HTML 파일만 올릴 수 있어요");
    if (f.size > MAX_GAME_FILE_BYTES) return setError("파일이 50MB를 넘어요");
    setFile(f);
  }

  function pickThumb(f: File | null) {
    setError(null);
    if (!f) return setThumb(null);
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return setError("썸네일은 PNG, JPG, WEBP만 돼요");
    if (f.size > MAX_THUMBNAIL_BYTES) return setError("썸네일은 5MB까지예요");
    setThumb(f);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);

    if (!file) return setError("게임 파일을 골라주세요");
    if (!categoryId) return setError("카테고리를 골라주세요");
    if (!controls) return setError("조작 방식을 골라주세요");
    if (!agreed) return setError("콘텐츠 정책에 동의해주세요");

    const fileType = file.name.toLowerCase().endsWith(".zip") ? "application/zip" : "text/html";
    const tags = String(form.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim().replace(/^#/, ""))
      .filter(Boolean)
      .slice(0, 10);

    setStep("uploading");
    try {
      // 1) 서버에 게임 정보 등록 + R2 업로드 주소 받기
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: existing?.id ?? null,
          title: form.get("title"),
          description: form.get("description"),
          howto: form.get("howto"),
          categoryId,
          tags,
          controls,
          aiTool: form.get("aiTool") || null,
          leaderboard,
          scoreOrder,
          multiplayer,
          maxPlayers,
          file: { name: file.name, size: file.size, type: fileType },
          thumbnail: thumb ? { name: thumb.name, size: thumb.size, type: thumb.type } : null,
        }),
      });
      const info = await res.json();
      if (!res.ok) throw new Error(info.error ?? "업로드를 시작하지 못했어요");

      // 2) 브라우저에서 R2로 바로 올리기
      const put = await fetch(info.uploadUrl, { method: "PUT", headers: { "Content-Type": fileType }, body: file });
      if (!put.ok) throw new Error("게임 파일을 올리지 못했어요");
      if (thumb && info.thumbnailUploadUrl) {
        const putThumb = await fetch(info.thumbnailUploadUrl, { method: "PUT", headers: { "Content-Type": thumb.type }, body: thumb });
        if (!putThumb.ok) throw new Error("썸네일을 올리지 못했어요");
      }

      // 3) 검사 대기열에 넣기
      const done = await fetch("/api/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: info.gameId, version: info.version, thumbnailUrl: info.thumbnailPublicUrl ?? null }),
      });
      if (!done.ok) throw new Error((await done.json()).error ?? "마무리하지 못했어요");
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 났어요");
      setStep("form");
    }
  }

  if (step === "done") {
    return (
      <section className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-6 py-14 text-center">
        <h2 className="m-0 text-xl font-bold">업로드 완료! 지금 자동 검사 중이에요</h2>
        <p className="m-0 text-muted">검사를 통과하면 바로 공개되고, 결과는 알림으로 알려드려요.</p>
        <Link href={`/users/${encodeURIComponent(nickname)}`} className="mt-2 inline-flex h-11 items-center rounded-full bg-ink px-5 font-bold text-white no-underline">
          내 게임 보기
        </Link>
      </section>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-6">
      <form onSubmit={submit} className="flex min-w-0 flex-[999_1_600px] flex-col gap-5">
        <Card title="1. 게임 파일">
          <label className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#B9B7AE] bg-[#FBFAF7] p-6 text-center">
            <input type="file" accept=".zip,.html,.htm" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
            <span className="text-base font-bold">{file ? file.name : "파일을 눌러서 선택"}</span>
            <span className="text-[13px] text-muted">zip(안에 index.html 필수) 또는 HTML 파일 하나 · 최대 50MB</span>
          </label>
        </Card>

        <Card title="2. 게임 정보">
          <Field id="title" label="제목" required>
            <input id="title" name="title" required maxLength={60} defaultValue={existing?.title} placeholder="예: 벽돌깨기 리믹스" className={inputClass} />
          </Field>
          <Field id="description" label="게임 설명">
            <textarea id="description" name="description" rows={4} maxLength={2000} defaultValue={existing?.description ?? ""} placeholder="어떤 게임인지, 목표는 무엇인지 알려주세요" className={textareaClass} />
          </Field>
          <Field id="howto" label="조작법">
            <textarea id="howto" name="howto" rows={3} maxLength={1000} defaultValue={existing?.howto ?? ""} placeholder="예: ← → 키로 이동, 스페이스로 발사" className={textareaClass} />
          </Field>
          <ChipGroup
            legend="카테고리"
            options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
            value={categoryId ? String(categoryId) : null}
            onChange={(v) => setCategoryId(Number(v))}
          />
          <Field id="tags" label="태그" hint="쉼표로 구분, 최대 10개. 검색에 쓰여요">
            <input id="tags" name="tags" defaultValue={existing?.tags?.join(", ")} placeholder="예: 레트로, 벽돌깨기" className={inputClass} />
          </Field>
          <ChipGroup
            legend="조작 방식"
            hint={'키보드만 고르면 목록에 "PC 권장" 표시가 붙어요'}
            options={[
              { value: "keyboard", label: "키보드" },
              { value: "touch", label: "터치" },
              { value: "both", label: "키보드·터치 둘 다" },
            ]}
            value={controls}
            onChange={setControls}
          />
          <Field id="aiTool" label="사용한 AI 툴 (선택)" hint="고르면 게임 페이지에 배지가 붙어요">
            <select id="aiTool" name="aiTool" defaultValue={existing?.ai_tool ?? ""} className={inputClass}>
              <option value="">선택 안 함</option>
              {AI_TOOLS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        </Card>

        <Card title="3. 썸네일 (선택)">
          <label className="inline-flex h-11 cursor-pointer items-center self-start rounded-full border border-line-strong bg-surface px-[18px] text-sm font-bold">
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pickThumb(e.target.files?.[0] ?? null)} />
            {thumb ? thumb.name : "이미지 선택"}
          </label>
          <span className="text-[13px] text-muted">올리지 않으면 자동 검사 때 게임 화면을 캡처해서 써요 (4:3 권장)</span>
        </Card>

        <Card title="4. 리더보드">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-muted">켜면 게임 페이지 댓글 옆에 점수 순위 탭이 생겨요</span>
            <button
              type="button"
              role="switch"
              aria-checked={leaderboard}
              aria-label="리더보드 사용"
              onClick={() => setLeaderboard((v) => !v)}
              className={`relative h-8 w-14 flex-none rounded-full ${leaderboard ? "bg-accent" : "bg-[#B9B7AE]"}`}
            >
              <span aria-hidden="true" className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${leaderboard ? "left-7" : "left-1"}`} />
            </button>
          </div>
          {leaderboard && (
            <>
              <ChipGroup
                legend="점수 방향"
                options={[
                  { value: "desc", label: "높을수록 좋음" },
                  { value: "asc", label: "낮을수록 좋음 (예: 기록 시간)" },
                ]}
                value={scoreOrder}
                onChange={(v) => setScoreOrder(v as "asc" | "desc")}
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-bold">게임 코드에 넣을 두 줄</span>
                <pre className="m-0 overflow-x-auto rounded-[10px] bg-ink px-4 py-3.5 font-mono text-[13px] leading-relaxed text-chip">{`<script src="${siteUrl}/sdk.js"></script>
// 게임이 끝날 때 점수를 넣어 호출
GameSDK.submitScore(점수);`}</pre>
                <span className="text-[13px] text-muted">
                  AI 툴에 &quot;게임이 끝나면 GameSDK.submitScore로 점수를 보내줘&quot;라고 요청하면 돼요
                </span>
              </div>
            </>
          )}
        </Card>

        <Card title="5. 멀티플레이">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-muted">켜면 같은 게임을 하는 사람들이 방에 모여 실시간으로 같이 놀 수 있어요</span>
            <button
              type="button"
              role="switch"
              aria-checked={multiplayer}
              aria-label="멀티 게임"
              onClick={() => setMultiplayer((v) => !v)}
              className={`relative h-8 w-14 flex-none rounded-full ${multiplayer ? "bg-accent" : "bg-[#B9B7AE]"}`}
            >
              <span aria-hidden="true" className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${multiplayer ? "left-7" : "left-1"}`} />
            </button>
          </div>
          {multiplayer && (
            <>
              <ChipGroup
                legend="한 방 최대 인원"
                options={[2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: String(n), label: `${n}명` }))}
                value={String(maxPlayers)}
                onChange={(v) => setMaxPlayers(Number(v))}
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-bold">게임 코드에서 쓰는 법</span>
                <pre className="m-0 overflow-x-auto rounded-[10px] bg-ink px-4 py-3.5 font-mono text-[13px] leading-relaxed text-chip">{`<script src="${siteUrl}/sdk.js"></script>
GameSDK.multi.join().then(room => { /* room.players, room.me */ })
  .catch(() => { /* 혼자·컴퓨터 상대로 시작 */ });
GameSDK.multi.on("message", (data, fromId) => { ... });
GameSDK.multi.send({ x, y });   // 1초에 10개, 2KB까지`}</pre>
                <span className="text-[13px] text-muted">
                  플레이어끼리 자유 채팅은 넣을 수 없어요. 대화는 사이트의 이모티콘 버튼으로 해요. 아무도 없을 때도 혼자 즐길 수 있게 만들어주세요.
                </span>
              </div>
            </>
          )}
        </Card>

        <Card title="6. 확인">
          <label className="flex items-start gap-2.5">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none accent-accent" />
            <span className="flex flex-col gap-0.5">
              <span className="font-bold">
                <Link href="/legal/content-policy" className="underline">
                  콘텐츠 정책
                </Link>
                에 동의해요
              </span>
              <span className="text-[13px] text-muted">
                전체이용가 게임이고, 다른 사람의 게임·캐릭터·음악을 허락 없이 쓰지 않았어요. 위반하면 신고로 내려가고 계정 제재를 받을 수 있어요.
              </span>
            </span>
          </label>
          {error && (
            <p role="alert" className="m-0 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-ink">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Link href="/" className="inline-flex h-12 items-center rounded-full border border-line-strong bg-surface px-5 font-medium text-ink no-underline">
              취소
            </Link>
            <button
              type="submit"
              disabled={step === "uploading"}
              className={`h-12 rounded-full px-6 text-[15px] font-bold text-white ${agreed ? "bg-accent" : "bg-[#8A8992]"} disabled:opacity-70`}
            >
              {step === "uploading" ? "올리는 중…" : "검사 받고 올리기"}
            </button>
          </div>
        </Card>
      </form>

      <aside aria-label="업로드 안내" className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
        <section className="flex flex-col gap-3.5 rounded-xl border border-line bg-surface p-5">
          <h2 className="m-0 text-base font-bold">올리면 이렇게 진행돼요</h2>
          <ol className="m-0 flex list-decimal flex-col gap-2 pl-5 text-sm text-body">
            <li>파일 확인: index.html이 있는지, 50MB 이하인지</li>
            <li>코드 검사: 악성 스크립트 패턴이 있는지</li>
            <li>실행 테스트: 브라우저에서 실제로 켜지는지</li>
            <li>바로 공개: 통과하면 최신 게임에 올라가요</li>
          </ol>
          <p className="m-0 border-t border-[#EFEEE8] pt-3 text-[13px] text-muted">통과하지 못하면 이유를 알림으로 보내드려요.</p>
        </section>
        <section className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-5">
          <h2 className="m-0 text-base font-bold">업로드 규칙</h2>
          <ul className="m-0 flex list-disc flex-col gap-1.5 pl-[18px] text-sm text-body">
            <li>게임 하나에 50MB까지</li>
            <li>하루 5개까지 올릴 수 있어요</li>
            <li>전체이용가 게임만 가능해요</li>
            <li>남의 저작물을 쓰면 권리자 신고로 내려갈 수 있어요</li>
            <li>새 버전을 올려도 좋아요·댓글·플레이수는 그대로예요</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-6">
      <h2 className="m-0 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ id, label, hint, required, children }: { id: string; label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        {label} {required && <span className="text-accent">*</span>}
      </label>
      {children}
      {hint && <span className="text-[13px] text-muted">{hint}</span>}
    </div>
  );
}

function ChipGroup({
  legend,
  hint,
  options,
  value,
  onChange,
}: {
  legend: string;
  hint?: string;
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 p-0 text-sm font-bold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={`h-11 rounded-full border px-[18px] text-sm font-medium ${on ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink"}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {hint && <span className="text-[13px] text-muted">{hint}</span>}
    </fieldset>
  );
}
