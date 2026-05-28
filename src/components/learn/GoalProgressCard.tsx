import Link from "next/link";
import { Target, TrendingUp, CalendarClock, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { GoalProgress } from "@/types/gamification";

const RING_SIZE = 180;
const RING_RADIUS = 78;
const RING_STROKE = 14;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export default function GoalProgressCard({ goal }: { goal: GoalProgress | null }) {
  if (!goal) {
    return (
      <Card className="border-brand/20 bg-brand/5">
        <CardContent className="flex flex-col items-start gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="bg-brand/10 text-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
              <Target size={20} />
            </div>
            <div>
              <p className="font-semibold">장기 학습 목표를 설정해 보세요</p>
              <p className="text-muted-foreground mt-0.5 text-sm">예: 100일 안에 1000문장 암기. 매일 채울 최소 문장 수가 자동으로 계산됩니다.</p>
            </div>
          </div>
          <Button nativeButton={false} variant="brand" size="sm" render={<Link href="/learn/goal" />} className="shrink-0">
            목표 설정
          </Button>
        </CardContent>
      </Card>
    );
  }

  const goalCompleted = goal.memorized >= goal.totalGoal;
  const periodEnded = goal.daysRemaining === 0 && !goalCompleted;
  const dashOffset = RING_CIRCUMFERENCE - (goal.percentage / 100) * RING_CIRCUMFERENCE;
  const ringColorClass = goalCompleted || goal.isOnTrack ? "text-success" : "text-streak-orange";

  return (
    <Card className="border-brand/20">
      <CardContent className="flex flex-col gap-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-brand" />
            <span className="font-semibold">학습 목표</span>
          </div>
          <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/learn/goal" />}>
            수정
          </Button>
        </div>

        <div className="flex justify-center">
          <div className="relative inline-flex items-center justify-center">
            <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90" aria-hidden="true">
              <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth={RING_STROKE} className="text-muted" />
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
                className={`${ringColorClass} transition-all duration-1000`}
              />
            </svg>
            <div className="absolute flex flex-col items-center leading-none">
              <span className="text-4xl font-bold tabular-nums">{goal.percentage}%</span>
              <div className="text-muted-foreground mt-2 flex items-baseline gap-1 text-sm">
                <span className="text-foreground text-base font-semibold tabular-nums">{goal.memorized.toLocaleString()}</span>
                <span>/</span>
                <span className="tabular-nums">{goal.totalGoal.toLocaleString()}</span>
              </div>
            </div>
          </div>
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
