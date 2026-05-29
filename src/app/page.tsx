import Link from "next/link";
import { cookies } from "next/headers";
import { PenLine, Mic, CalendarDays, Star, Flame, Trophy, Target, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/utils/supabase/server";
import { fetchUserStats, fetchDailyProgress, fetchGoalProgress, fetchDailyMemorized } from "@/lib/gamification";
import StreakBadge from "@/components/learn/StreakBadge";
import DailyProgressRing from "@/components/learn/DailyProgressRing";
import GoalProgressCard from "@/components/learn/GoalProgressCard";
import LearningCalendar from "@/components/learn/LearningCalendar";

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "My Haru";

const steps = [
  {
    icon: PenLine,
    step: "1",
    title: "문장 입력",
    description: "배우고 싶은 영어 문장과 한국어 뜻을 입력하면 AI가 원어민 발음을 자동 생성합니다.",
  },
  {
    icon: Mic,
    step: "2",
    title: "말하기·쓰기 학습",
    description: "한국어 뜻을 보고 영어로 말하거나 입력하세요. 정확하면 학습 완료로 인정됩니다.",
  },
  {
    icon: Trophy,
    step: "3",
    title: "성장 확인",
    description: "정답마다 XP를 획득하고, 매일 연속 학습으로 스트릭을 쌓으며 실력을 키워 보세요.",
  },
];

const highlights = [
  {
    icon: Volume2,
    title: "AI 원어민 발음",
    description: "OpenAI TTS로 생성된 자연스러운 원어민 발음을 언제든 들을 수 있습니다.",
  },
  {
    icon: Star,
    title: "XP & 레벨",
    description: "정답 10 XP, 도전 2 XP. 쌓인 경험치로 나의 학습 성과를 한눈에 확인하세요.",
  },
  {
    icon: Flame,
    title: "연속 학습 스트릭",
    description: "매일 하루 한 번 학습하면 스트릭이 올라갑니다. 기록을 깨지 마세요!",
  },
  {
    icon: Target,
    title: "일일 목표",
    description: "하루 5문장 목표를 설정하고 달성률을 원형 프로그레스로 확인할 수 있습니다.",
  },
];

export default async function Home() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const username = user.email?.split("@")[0] ?? "회원";
    const [{ count }, stats, dailyProgress, goalProgress, dailyMemorized] = await Promise.all([
      supabase.from("sentences").select("*", { count: "exact", head: true }),
      fetchUserStats(supabase, user.id),
      fetchDailyProgress(supabase, user.id),
      fetchGoalProgress(supabase, user.id),
      fetchDailyMemorized(supabase, user.id),
    ]);
    const hasSentences = (count ?? 0) > 0;
    const dailyGoalDisplay = goalProgress?.dailyMinimum && goalProgress.dailyMinimum > 0 ? goalProgress.dailyMinimum : dailyProgress.goal;

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

        {/* 장기 목표 진도 */}
        <GoalProgressCard goal={goalProgress} />

        {/* 스탯 카드 */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-xp-gold/20 bg-xp-gold/5">
            <CardContent className="flex flex-col items-center gap-1 py-4">
              <Star size={20} className="text-xp-gold" />
              <span className="text-xp-gold text-xl font-bold">{stats?.total_xp?.toLocaleString() ?? 0}</span>
              <span className="text-muted-foreground text-[11px]">XP</span>
            </CardContent>
          </Card>
          <Card className="border-streak-orange/20 bg-streak-orange/5">
            <CardContent className="flex flex-col items-center gap-1 py-4">
              <Flame size={20} className="text-streak-orange" />
              <span className="text-streak-orange text-xl font-bold">{stats?.current_streak ?? 0}일</span>
              <span className="text-muted-foreground text-[11px]">연속</span>
            </CardContent>
          </Card>
          <Card className="border-brand/20 bg-brand/5">
            <CardContent className="flex flex-col items-center gap-1 py-4">
              <DailyProgressRing completed={dailyProgress.completed} goal={dailyGoalDisplay} className="scale-[0.55]" />
              <span className="text-muted-foreground text-[11px]">오늘 목표</span>
            </CardContent>
          </Card>
        </div>

        {/* 학습 달력 (월간 암기 히트맵) */}
        <LearningCalendar history={dailyMemorized} dailyGoal={dailyGoalDisplay} />

        {/* 온보딩 */}
        {!hasSentences && (
          <Card className="border-brand/20 bg-brand/5">
            <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="font-medium">아직 저장된 문장이 없어요.</p>
              <p className="text-muted-foreground text-sm">첫 영어 문장을 입력하고 학습을 시작해 보세요!</p>
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
                <div className="bg-brand/10 text-brand group-hover:bg-brand/20 flex h-14 w-14 items-center justify-center rounded-full transition-colors">
                  <PenLine size={28} />
                </div>
                <h2 className="text-lg font-semibold">문장 입력</h2>
                <p className="text-muted-foreground text-sm">새로운 영어 문장을 추가하세요</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/learn/review" className="group">
            <Card className="h-full">
              <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="bg-brand/10 text-brand group-hover:bg-brand/20 flex h-14 w-14 items-center justify-center rounded-full transition-colors">
                  <CalendarDays size={28} />
                </div>
                <h2 className="text-lg font-semibold">학습하기</h2>
                <p className="text-muted-foreground text-sm">말하기·쓰기로 학습하세요</p>
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
        <div className="from-brand/5 absolute inset-0 -z-10 bg-gradient-to-b via-transparent to-transparent" />
        <div className="mx-auto max-w-3xl">
          <div className="bg-brand/10 text-brand mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium">
            <Flame size={16} />
            말하기·쓰기 · XP · 스트릭
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            영어 한 문장으로 시작하는
            <br />
            <span className="text-brand">나의 하루</span>
          </h1>
          <p className="text-muted-foreground mx-auto mt-6 max-w-xl text-lg">
            나만의 영어 문장을 입력하고, AI 원어민 발음을 듣고, 말하기·쓰기로 학습하세요. XP를 모으고 스트릭을 이어가며 매일 성장하는 학습 습관을 만들어
            보세요.
          </p>
          <div className="mt-10">
            <Button nativeButton={false} render={<Link href="/signup" />} variant="brand" className="h-12 px-8 text-base font-semibold">
              무료로 시작하기
            </Button>
          </div>
        </div>
      </section>

      {/* 학습 흐름 3단계 */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-4 text-center text-2xl font-bold tracking-tight">3단계로 영어를 익혀요</h2>
          <p className="text-muted-foreground mb-12 text-center">입력 → 학습 → 성장, 심플하지만 효과적인 학습 사이클</p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {steps.map((item, i) => (
              <Card
                key={item.title}
                className="animate-in fade-in slide-in-from-bottom-4 fill-mode-both"
                style={{ animationDelay: `${i * 150}ms`, animationDuration: "600ms" }}>
                <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
                  <div className="bg-brand/10 text-brand relative flex h-14 w-14 items-center justify-center rounded-full">
                    <item.icon size={28} />
                    <span className="bg-brand text-brand-foreground absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold">
                      {item.step}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* 게이미피케이션 하이라이트 */}
      <section className="bg-muted/30 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-4 text-center text-2xl font-bold tracking-tight">재미있게 꾸준히</h2>
          <p className="text-muted-foreground mb-12 text-center">게임처럼 즐기면서 영어 실력을 키워 보세요</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {highlights.map((item, i) => (
              <div
                key={item.title}
                className="animate-in fade-in slide-in-from-bottom-2 border-border bg-background fill-mode-both flex items-start gap-4 rounded-xl border p-5"
                style={{ animationDelay: `${i * 100}ms`, animationDuration: "500ms" }}>
                <div className="bg-brand/10 text-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                  <item.icon size={20} />
                </div>
                <div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 하단 CTA */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-2xl font-bold tracking-tight">오늘 첫 문장을 시작하세요</h2>
          <p className="text-muted-foreground mt-4">가입 후 바로 문장을 입력하고 학습을 시작할 수 있습니다. 완전 무료입니다.</p>
          <div className="mt-8">
            <Button nativeButton={false} render={<Link href="/signup" />} variant="brand" className="h-11 px-6 font-semibold">
              무료로 시작하기
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
