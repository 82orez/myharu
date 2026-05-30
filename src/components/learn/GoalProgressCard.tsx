import Link from "next/link";
import { Target, TrendingUp, CalendarClock, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { GoalProgress } from "@/types/gamification";

const RING_SIZE = 184;
const RING_STROKE = 15;

function Ring({ percent, colorClass, top, bottom }: { percent: number; colorClass: string; top: React.ReactNode; bottom: React.ReactNode }) {
  const r = (RING_SIZE - RING_STROKE) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(Math.max(percent, 0), 100) / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90" aria-hidden="true">
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} fill="none" stroke="currentColor" strokeWidth={RING_STROKE} className="text-muted" />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className={`${colorClass} transition-all duration-1000`}
        />
      </svg>
      <div className="absolute flex flex-col items-center leading-none">
        {top}
        {bottom}
      </div>
    </div>
  );
}

function RingBlock({
  label,
  percent,
  colorClass,
  top,
  bottom,
}: {
  label: string;
  percent: number;
  colorClass: string;
  top: React.ReactNode;
  bottom: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-muted-foreground text-base font-semibold">{label}</span>
      <Ring percent={percent} colorClass={colorClass} top={top} bottom={bottom} />
    </div>
  );
}

export default function GoalProgressCard({
  goal,
  dailyCompleted,
  dailyGoal,
}: {
  goal: GoalProgress | null;
  dailyCompleted: number;
  dailyGoal: number;
}) {
  // 당일 진행률
  const dailyPct = dailyGoal > 0 ? Math.min((dailyCompleted / dailyGoal) * 100, 100) : 0;
  const dailyDone = dailyGoal > 0 && dailyCompleted >= dailyGoal;
  const dailyRing = (
    <RingBlock
      label="오늘"
      percent={dailyPct}
      colorClass={dailyDone ? "text-success" : "text-brand"}
      top={<span className="text-4xl font-bold tabular-nums">{Math.round(dailyPct)}%</span>}
      bottom={
        <div className="text-muted-foreground mt-1.5 flex items-baseline gap-1 text-sm">
          <span className="text-foreground text-base font-semibold tabular-nums">{dailyCompleted}</span>
          <span>/</span>
          <span className="tabular-nums">{dailyGoal}</span>
        </div>
      }
    />
  );

  if (!goal) {
    return (
      <Card className="border-brand/20 bg-brand/5">
        <CardContent className="flex flex-col items-center gap-4 py-5">
          {dailyRing}
          <div className="text-center">
            <p className="font-semibold">장기 학습 목표를 설정해 보세요</p>
            <p className="text-muted-foreground mt-0.5 text-sm">예: 100일 안에 1000문장 암기. 매일 채울 최소 문장 수가 자동으로 계산됩니다.</p>
          </div>
          <Button nativeButton={false} variant="brand" size="sm" render={<Link href="/learn/goal" />}>
            목표 설정
          </Button>
        </CardContent>
      </Card>
    );
  }

  const goalCompleted = goal.memorized >= goal.totalGoal;
  const periodEnded = goal.daysRemaining === 0 && !goalCompleted;
  // 소수 첫째 자리까지 표시하기 위해 memorized/totalGoal로 재계산 (goal.percentage는 정수 반올림값)
  const percentExact = goal.totalGoal > 0 ? Math.min((goal.memorized / goal.totalGoal) * 100, 100) : 0;
  const overallColor = goalCompleted || goal.isOnTrack ? "text-success" : "text-streak-orange";

  return (
    <Card className="border-brand/20">
      <CardContent className="flex flex-col gap-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-brand" />
            <span className="font-semibold">학습 목표</span>
          </div>
          <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/learn/goal" />} className="shrink-0">
            수정
          </Button>
        </div>

        <p className="text-center text-xl font-bold tracking-tight">
          <span className="text-brand">{goal.periodDays}</span>일 동안 <span className="text-brand">{goal.totalGoal.toLocaleString()} 문장</span>{" "}
          암기하기
        </p>

        <div className="flex flex-wrap items-center justify-center gap-10 md:p-2">
          <RingBlock
            label="전체"
            percent={percentExact}
            colorClass={overallColor}
            top={<span className="text-4xl font-bold tabular-nums">{percentExact.toFixed(1)}%</span>}
            bottom={
              <div className="text-muted-foreground mt-1.5 flex items-baseline gap-1 text-sm">
                <span className="text-foreground text-base font-semibold tabular-nums">{goal.memorized.toLocaleString()}</span>
                <span>/</span>
                <span className="tabular-nums">{goal.totalGoal.toLocaleString()}</span>
              </div>
            }
          />
          {dailyRing}
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-muted/40 flex items-center gap-2 rounded-lg px-3 py-2">
            <CalendarClock size={16} className="text-muted-foreground shrink-0" />
            <div className="flex flex-col leading-tight">
              <span className="text-muted-foreground text-xs">남은 기간</span>
              <span className="font-medium tabular-nums">{goal.daysRemaining}일</span>
            </div>
          </div>
          <div className="bg-muted/40 flex items-center gap-2 rounded-lg px-3 py-2">
            <TrendingUp size={16} className="text-muted-foreground shrink-0" />
            <div className="flex flex-col leading-tight">
              <span className="text-muted-foreground text-xs">오늘 최소</span>
              <span className="font-medium tabular-nums">{goal.dailyMinimum}문장</span>
            </div>
          </div>
        </div>

        {goalCompleted ? (
          <div className="bg-success/10 text-success flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium">
            <CheckCircle2 size={16} />
            목표 달성! 잘 해냈어요.
          </div>
        ) : periodEnded ? (
          <div className="bg-streak-orange/10 text-streak-orange flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium">
            <AlertTriangle size={16} />
            목표 기간이 종료되었습니다. 새 목표를 설정해 보세요.
          </div>
        ) : goal.isOnTrack ? (
          <div className="bg-success/10 text-success flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium">
            <CheckCircle2 size={16} />
            계획대로 잘 진행 중이에요!
          </div>
        ) : (
          <div className="bg-streak-orange/10 text-streak-orange flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium">
            <AlertTriangle size={16} />
            페이스가 조금 늦어요. 오늘 최소 {goal.dailyMinimum}문장을 채워 보세요!
          </div>
        )}
      </CardContent>
    </Card>
  );
}
