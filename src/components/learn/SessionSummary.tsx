"use client";

import Link from "next/link";
import { Trophy, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SessionSummary as SessionSummaryType } from "@/types/gamification";

export default function SessionSummary({ summary, onRestart }: { summary: SessionSummaryType; onRestart: () => void }) {
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (summary.accuracy / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <div className="animate-in fade-in zoom-in-95 duration-500">
        <Trophy className="text-xp-gold h-16 w-16" />
      </div>

      <h2 className="animate-in fade-in slide-in-from-bottom-2 text-2xl font-bold" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
        학습 완료!
      </h2>

      {/* 정확도 원형 프로그레스 */}
      <div className="animate-in fade-in relative duration-500" style={{ animationDelay: "400ms", animationFillMode: "both" }}>
        <svg width="140" height="140" className="-rotate-90">
          <circle cx="70" cy="70" r="54" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
          <circle
            cx="70"
            cy="70"
            r="54"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="text-brand transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold">{summary.accuracy}%</span>
          <span className="text-muted-foreground text-xs">정확도</span>
        </div>
      </div>

      {/* 통계 그리드 */}
      <div
        className="animate-in fade-in slide-in-from-bottom-4 grid w-full max-w-xs grid-cols-2 gap-3"
        style={{ animationDelay: "600ms", animationFillMode: "both" }}>
        <div className="bg-success/10 flex flex-col items-center gap-1 rounded-xl p-4">
          <Check className="text-success h-5 w-5" />
          <span className="text-success text-2xl font-bold">{summary.correctCount}</span>
          <span className="text-muted-foreground text-xs">정답</span>
        </div>
        <div className="bg-destructive/10 flex flex-col items-center gap-1 rounded-xl p-4">
          <X className="text-destructive h-5 w-5" />
          <span className="text-destructive text-2xl font-bold">{summary.incorrectCount}</span>
          <span className="text-muted-foreground text-xs">오답</span>
        </div>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-2 mt-2 flex gap-3" style={{ animationDelay: "900ms", animationFillMode: "both" }}>
        <Button variant="brand" onClick={onRestart} className="h-12 px-6 text-base font-semibold">
          다시 풀기
        </Button>
        <Button nativeButton={false} variant="outline" render={<Link href="/" />} className="h-12 px-6 text-base font-semibold">
          홈으로
        </Button>
      </div>
    </div>
  );
}
