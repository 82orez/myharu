import Link from "next/link";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

export default function GoalProgressCard({ dailyCompleted, dailyGoal }: { dailyCompleted: number; dailyGoal: number }) {
  const dailyPct = dailyGoal > 0 ? Math.min((dailyCompleted / dailyGoal) * 100, 100) : 0;
  const goalMet = dailyCompleted >= dailyGoal;

  return (
    <Card className="border-brand/20">
      <CardContent className="flex flex-col items-center gap-4 py-5">
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-brand" />
            <span className="font-semibold">오늘의 목표</span>
          </div>
          <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/learn/goal" />} className="shrink-0">
            목표 수정
          </Button>
        </div>

        <Ring
          percent={dailyPct}
          colorClass="text-xp-gold"
          top={<span className="text-4xl font-bold tabular-nums">{Math.round(dailyPct)}%</span>}
          bottom={
            <div className="text-muted-foreground mt-1.5 flex items-baseline gap-1 text-sm">
              <span className="text-foreground text-base font-semibold tabular-nums">{dailyCompleted}</span>
              <span>/</span>
              <span className="tabular-nums">{dailyGoal}</span>
            </div>
          }
        />

        <p className="text-muted-foreground text-sm">
          {goalMet ? "오늘 목표를 달성했어요! 잘했어요 👏" : `오늘 ${dailyGoal}문장 중 ${dailyCompleted}문장 완료`}
        </p>
      </CardContent>
    </Card>
  );
}
