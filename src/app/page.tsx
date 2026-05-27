import Link from "next/link";
import { cookies } from "next/headers";
import { PenLine, Mic, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/utils/supabase/server";

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "My Haru";

const features = [
  {
    icon: PenLine,
    title: "문장 입력",
    description: "원하는 영어 문장과 뜻을 입력하면 AI가 원어민 발음을 생성합니다.",
  },
  {
    icon: Mic,
    title: "발음 연습",
    description: "마이크로 직접 말하면 내 발음을 인식해 정답을 확인합니다.",
  },
  {
    icon: CalendarDays,
    title: "매일 복습",
    description: "날짜별로 복습하며 매일 학습 습관을 만들어 보세요.",
  },
];

export default async function Home() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const username = user.email?.split("@")[0] ?? "회원";
    const { count } = await supabase.from("sentences").select("*", { count: "exact", head: true });
    const hasSentences = (count ?? 0) > 0;

    return (
      <main className="mx-auto flex min-h-[calc(100vh-200px)] max-w-3xl flex-col items-center justify-center gap-8 px-6 py-16">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            안녕하세요, <span className="text-brand">{username}</span>님!
          </h1>
          <p className="mt-2 text-muted-foreground">오늘도 영어 한 문장으로 시작해 볼까요?</p>
        </div>

        {!hasSentences && (
          <Card className="w-full border-brand/20 bg-brand/5">
            <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="font-medium">아직 저장된 문장이 없어요.</p>
              <p className="text-sm text-muted-foreground">첫 영어 문장을 입력하고 학습을 시작해 보세요!</p>
              <Button nativeButton={false} render={<Link href="/learn/input" />} className="mt-2 bg-brand text-brand-foreground hover:bg-brand/90">
                첫 문장 입력하기
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          <Link href="/learn/input" className="group">
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand transition-colors group-hover:bg-brand/20">
                  <PenLine size={24} />
                </div>
                <h2 className="text-lg font-semibold">문장 입력</h2>
                <p className="text-sm text-muted-foreground">새로운 영어 문장을 추가하세요</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/learn/review" className="group">
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand transition-colors group-hover:bg-brand/20">
                  <CalendarDays size={24} />
                </div>
                <h2 className="text-lg font-semibold">복습하기</h2>
                <p className="text-sm text-muted-foreground">저장한 문장을 연습하세요</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      {/* 히어로 섹션 */}
      <section className="relative overflow-hidden px-6 py-24 text-center">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand/5 via-transparent to-transparent" />
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            영어 한 문장으로 시작하는
            <br />
            <span className="text-brand">나의 하루</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            영어 문장을 입력하고, AI 원어민 발음을 듣고, 직접 말하며 연습하세요. 매일 한 문장씩, 나만의 학습 습관을 만들어 보세요.
          </p>
          <div className="mt-10">
            <Button nativeButton={false} render={<Link href="/signup" />} className="h-12 bg-brand px-8 text-base font-semibold text-brand-foreground hover:bg-brand/90">
              무료로 시작하기
            </Button>
          </div>
        </div>
      </section>

      {/* 기능 소개 */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-12 text-center text-2xl font-bold tracking-tight">이렇게 학습해요</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {features.map((feature, i) => (
              <Card key={feature.title} className="animate-in fade-in slide-in-from-bottom-4 fill-mode-both" style={{ animationDelay: `${i * 150}ms`, animationDuration: "600ms" }}>
                <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-brand">
                    <feature.icon size={28} />
                  </div>
                  <h3 className="text-lg font-semibold">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* 하단 CTA */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-2xl font-bold tracking-tight">지금 시작하세요</h2>
          <p className="mt-4 text-muted-foreground">이메일 또는 카카오 계정으로 간편하게 가입할 수 있습니다.</p>
          <div className="mt-8 flex justify-center gap-3">
            <Button nativeButton={false} render={<Link href="/signup" />} className="h-11 bg-brand px-6 font-semibold text-brand-foreground hover:bg-brand/90">
              회원가입
            </Button>
            <Button nativeButton={false} variant="outline" render={<Link href="/login" />} className="h-11 px-6 font-semibold">
              로그인
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
