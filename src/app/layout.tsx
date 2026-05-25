import type { Metadata } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AuthHashHandler from "@/components/auth/AuthHashHandler";
import { createClient } from "@/utils/supabase/server";

const pretendard = localFont({
  src: "../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});

export const metadata: Metadata = {
  title: {
    default: "My Haru",
    template: "%s | My Haru",
  },
  description: "나의 하루를 기록하고 관리하는 개인 서비스",
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

  return (
    <html lang="ko" className={pretendard.variable}>
      <body className="bg-background font-sans text-foreground antialiased">
        <Navbar user={user ? { email: user.email } : null} />
        <AuthHashHandler />
        {children}
        <Footer />
      </body>
    </html>
  );
}
