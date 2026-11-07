import type { Metadata } from "next";
import { Black_Han_Sans, Noto_Sans_KR } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import "./globals.css";

const noto = Noto_Sans_KR({
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
  variable: "--font-noto",
  preload: false,
});

const blackHan = Black_Han_Sans({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-black-han",
  preload: false,
});

export const metadata: Metadata = {
  title: "[사이트 이름]",
  description: "AI로 만든 미니게임을 올리고 같이 노는 곳",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${noto.variable} ${blackHan.variable}`}>
      <body className="font-sans text-[15px] leading-normal">
        {/* 내용이 짧아도 푸터가 화면 맨 아래에 붙도록 세로 flex로 감싸요 */}
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="mx-auto w-full max-w-[1248px] flex-1 px-6 pb-16 pt-6">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
