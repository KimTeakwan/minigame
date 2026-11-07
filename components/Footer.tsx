import Link from "next/link";

const LINKS = [
  { href: "/legal/terms", label: "이용약관" },
  { href: "/legal/privacy", label: "개인정보처리방침" },
  { href: "/legal/content-policy", label: "콘텐츠 정책" },
  { href: "/copyright", label: "저작권 침해 신고 (권리자)" },
  { href: "/legal/copyright-agent", label: "신고 접수 담당자 안내" },
];

export default function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-[1248px] flex-wrap items-center justify-between gap-4 px-6 py-6 text-[13px] text-muted">
        <span>© [사이트 이름]</span>
        <nav aria-label="사이트 정보" className="flex flex-wrap gap-4">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-muted underline">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
