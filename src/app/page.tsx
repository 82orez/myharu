import Link from "next/link";
import { cookies } from "next/headers";
import { PenLine, Mic, CalendarDays, Star, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/utils/supabase/server";
import { fetchUserStats, fetchDailyProgress } from "@/lib/gamification";
import StreakBadge from "@/components/learn/StreakBadge";
import DailyProgressRing from "@/components/learn/DailyProgressRing";

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
    const [{ count }, stats, dailyProgress] = await Promise.all([
      supabase.from("sentences").select("*", { count: "exact", head: true }),
      fetchUserStats(supabase, user.id),
      fetchDailyProgress(supabase, user.id),
    ]);
    const hasSentences = (count ?? 0) > 0;

    return (
      <main className="mx-auto flex min-h-[calc(100vh-200px)] max-w-3xl flex-col gap-8 px-6 py-10">
        {/* 인사 + 스트릭 */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              안녕하세요, <span className="text-brand">{username}</span>님!
            </h1>
            {stats && <StreakBadge streak={stats.current_streak} />}
          </div>
          <p className="text-muted-foreground">
            {stats?.current_streak && stats.current_streak > 0 ? "꾸준히 잘 하고 있어요! 오늘도 이어가세요." : "오늘 첫 학습을 시작해 볼까요?"}
          </p>
        </div>

        {/* 스탯 카드 */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-xp-gold/20 bg-xp-gold/5">
            <CardContent className="flex flex-col items-center gap-1 py-4">
              <Star size={20} className="text-xp-gold" />
              <span className="text-xl font-bold text-xp-gold">{stats?.total_xp?.toLocaleString() ?? 0}</span>
              <span className="text-[11px] text-muted-foreground">XP</span>
            </CardContent>
          </Card>
          <Card className="border-streak-orange/20 bg-streak-orange/5">
            <CardContent className="flex flex-col items-center gap-1 py-4">
              <Flame size={20} className="text-streak-orange" />
              <span className="text-xl font-bold text-streak-orange">{stats?.current_streak ?? 0}일</span>
              <span className="text-[11px] text-muted-foreground">연속</span>
            </CardContent>
          </Card>
          <Card className="border-brand/20 bg-brand/5">
            <CardContent className="flex flex-col items-center gap-1 py-4">
              <DailyProgressRing completed={dailyProgress.completed} goal={dailyProgress.goal} className="scale-[0.55]" />
              <span className="text-[11px] text-muted-foreground">오늘 목표</span>
            </CardContent>
          </Card>
        </div>

        {/* 온보딩 */}
        {!hasSentences && (
          <Card className="border-brand/20 bg-brand/5">
            <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="font-medium">아직 저장된 문장이 없어요.</p>
              <p className="text-sm text-muted-foreground">첫 영어 문장을 입력하고 학습을 시작해 보세요!</p>
              <Button nativeButton={false} variant="brand" render={<Link href="/learn/input" />} className="mt-2">
                첫 문장 입력하기
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 액션 카드 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link href="/learn/input" className="group">
            <Card className="h-full">
              <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-brand transition-colors group-hover:bg-brand/20">
                  <PenLine size={28} />
                </div>
                <h2 className="text-lg font-semibold">문장 입력</h2>
                <p className="text-sm text-muted-foreground">새로운 영어 문장을 추가하세요</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/learn/review" className="group">
            <Card className="h-full">
              <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-brand transition-colors group-hover:bg-brand/20">
                  <CalendarDays size={28} />
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
            <Button nativeButton={false} render={<Link href="/signup" />} variant="brand" className="h-12 px-8 text-base font-semibold">
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
            <Button nativeButton={false} render={<Link href="/signup" />} variant="brand" className="h-11 px-6 font-semibold">
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
