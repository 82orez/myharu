"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const LEVEL_CLASS = ["bg-muted/40", "bg-success/15", "bg-success/35", "bg-success/60", "bg-success text-white"];

function pad(n: number): number | string {
  return n < 10 ? `0${n}` : n;
}

// 신규 암기 수와 일일 목표 대비 비율로 색 농도 레벨(0~4) 산출
function levelOf(count: number, dailyGoal: number): number {
  if (count <= 0) return 0;
  const ratio = dailyGoal > 0 ? count / dailyGoal : count;
  if (ratio < 0.5) return 1;
  if (ratio < 1) return 2;
  if (ratio < 2) return 3;
  return 4;
}

// 일일 목표 달성도로 기호 산출. O=목표 달성, triangle=부분 달성, X=미학습(지난 날), null=기호 없음
function markOf(count: number, dailyGoal: number, dateStr: string, startBoundary: string, todayKst: string): "O" | "triangle" | "X" | null {
  const goalThreshold = dailyGoal > 0 ? dailyGoal : 1;
  if (count >= goalThreshold) return "O";
  if (count > 0) return "triangle";
  // count === 0: 시작일 이후의 지난 날에만 X (오늘/미래/시작 전은 표시 안 함)
  if (dateStr < todayKst && dateStr >= startBoundary) return "X";
  return null;
}

export default function LearningCalendar({
  history,
  dailyGoal,
  startDate,
}: {
  history: Record<string, number>;
  dailyGoal: number;
  startDate?: string | null;
}) {
  // 현재 KST 연/월/일
  const todayKst = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const [ty, tm] = todayKst.split("-").map(Number);

  // X 표시의 시작 경계: 장기 목표 시작일 → 없으면 history 최초 암기일 → 없으면 오늘
  const startBoundary = startDate ?? Object.keys(history).sort()[0] ?? todayKst;

  const [view, setView] = useState<{ year: number; month: number }>({ year: ty, month: tm });

  const isCurrentMonth = view.year === ty && view.month === tm;

  const cells = useMemo(() => {
    const firstWeekday = new Date(view.year, view.month - 1, 1).getDay();
    const daysInMonth = new Date(view.year, view.month, 0).getDate();
    const result: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) result.push(null);
    for (let d = 1; d <= daysInMonth; d++) result.push(d);
    return result;
  }, [view]);

  function goPrev() {
    setView((v) => (v.month === 1 ? { year: v.year - 1, month: 12 } : { year: v.year, month: v.month - 1 }));
  }

  function goNext() {
    if (isCurrentMonth) return;
    setView((v) => (v.month === 12 ? { year: v.year + 1, month: 1 } : { year: v.year, month: v.month + 1 }));
  }

  return (
    <Card className="border-brand/20">
      <CardContent className="flex flex-col gap-4 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays size={18} className="text-brand" />
            <span className="font-semibold">학습 달력</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goPrev}
              className="hover:bg-muted text-muted-foreground flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
              aria-label="이전 달">
              <ChevronLeft size={18} />
            </button>
            <span className="min-w-[5.5rem] text-center text-sm font-medium tabular-nums">
              {view.year}년 {view.month}월
            </span>
            <button
              type="button"
              onClick={goNext}
              disabled={isCurrentMonth}
              className="hover:bg-muted text-muted-foreground flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="다음 달">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-muted-foreground pb-1 text-center text-xs font-medium">
              {w}
            </div>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} />;
            const dateStr = `${view.year}-${pad(view.month)}-${pad(day)}`;
            const count = history[dateStr] ?? 0;
            const level = levelOf(count, dailyGoal);
            const mark = markOf(count, dailyGoal, dateStr, startBoundary, todayKst);
            const isToday = dateStr === todayKst;
            return (
              <div
                key={dateStr}
                title={`${view.month}월 ${day}일 · ${count}문장 암기`}
                className={`flex aspect-square flex-col items-center justify-center rounded-lg text-xs ${LEVEL_CLASS[level]} ${
                  isToday ? "ring-brand ring-2" : ""
                }`}>
                <span className={level >= 4 ? "font-semibold" : level === 0 ? "text-muted-foreground" : "font-medium"}>{day}</span>
                {mark === "O" && <span className={`text-[11px] leading-tight font-bold ${level >= 4 ? "" : "text-success"}`}>○</span>}
                {mark === "triangle" && <span className="text-streak-orange text-[11px] leading-tight font-bold">△</span>}
                {mark === "X" && <span className="text-muted-foreground/70 text-[11px] leading-tight">✕</span>}
              </div>
            );
          })}
        </div>

        <div className="text-muted-foreground flex items-center justify-center gap-3 text-[11px]">
          <span>
            <span className="text-success font-bold">○</span> 목표 달성
          </span>
          <span>
            <span className="text-streak-orange font-bold">△</span> 부분 달성
          </span>
          <span>
            <span className="text-muted-foreground/70">✕</span> 미학습
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
