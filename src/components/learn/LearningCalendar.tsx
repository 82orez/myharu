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

export default function LearningCalendar({ history, dailyGoal }: { history: Record<string, number>; dailyGoal: number }) {
  // 현재 KST 연/월/일
  const todayKst = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const [ty, tm] = todayKst.split("-").map(Number);

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
            const isToday = dateStr === todayKst;
            return (
              <div
                key={dateStr}
                title={`${view.month}월 ${day}일 · ${count}문장 암기`}
                className={`flex aspect-square flex-col items-center justify-center rounded-lg text-xs ${LEVEL_CLASS[level]} ${
                  isToday ? "ring-brand ring-2" : ""
                }`}>
                <span className={level >= 4 ? "font-semibold" : level === 0 ? "text-muted-foreground" : "font-medium"}>{day}</span>
                {count > 0 && <span className={`text-[10px] leading-tight ${level >= 4 ? "" : "text-muted-foreground"}`}>{count}</span>}
              </div>
            );
          })}
        </div>

        <div className="text-muted-foreground flex items-center justify-end gap-1.5 text-xs">
          <span>적음</span>
          {LEVEL_CLASS.map((cls, i) => (
            <span key={i} className={`h-3 w-3 rounded-sm ${cls}`} />
          ))}
          <span>많음</span>
        </div>
      </CardContent>
    </Card>
  );
}
