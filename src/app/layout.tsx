import type { Metadata } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import AuthHashHandler from "@/components/auth/AuthHashHandler";
import ScrollToTop from "@/components/ScrollToTop";
import { Toaster } from "@/components/ui/sonner";
import { createClient } from "@/utils/supabase/server";

const pretendard = localFont({
  src: "../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "My Haru — 매일 영어 한 문장 학습",
    template: "%s | My Haru",
  },
  description: "영어 문장을 입력하고, AI 원어민 발음을 듣고, 직접 말하며 연습하세요. 매일 한 문장씩, 나만의 영어 학습 습관을 만들어 보세요.",
  openGraph: {
    title: "My Haru — 매일 영어 한 문장 학습",
    description: "영어 문장을 입력하고, AI 원어민 발음을 듣고, 직접 말하며 연습하세요.",
    siteName: "My Haru",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "My Haru — 매일 영어 한 문장 학습",
    description: "영어 문장을 입력하고, AI 원어민 발음을 듣고, 직접 말하며 연습하세요.",
  },
  robots: { index: true, follow: true },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // D-day 배지용. ⚠️ fetchUserStats(select("*") + 없으면 upsert)를 쓰지 말 것 —
  // 이 레이아웃은 모든 페이지 렌더마다 도므로 PK 단일 조회로 최소화한다.
  const { data: stats } = user
    ? await supabase.from("user_stats").select("dday_label, dday_date").eq("user_id", user.id).maybeSingle()
    : { data: null };
  const dday = stats?.dday_date ? { label: stats.dday_label ?? "", date: stats.dday_date } : null;

  return (
    <html lang="ko" className={pretendard.variable}>
      <body className="bg-background text-foreground pb-16 font-sans antialiased md:pb-0">
        <ScrollToTop />
        <Navbar user={user ? { email: user.email } : null} dday={dday} />
        <AuthHashHandler />
        {children}
        <Footer />
        <BottomNav user={user ? { email: user.email } : null} />
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
