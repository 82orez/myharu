"use client";

import { useState } from "react";
import { BookOpen, List } from "lucide-react";
import QuizView from "@/components/learn/QuizView";
import ReviewClient from "@/components/learn/ReviewClient";
import type { Sentence } from "@/app/(learn)/learn/review/actions";
import type { UserStats } from "@/types/gamification";

type Tab = "quiz" | "list";

export default function ReviewTabs({
  sentences,
  stats,
  error,
  presets = [],
}: {
  sentences: Sentence[];
  stats?: UserStats;
  error?: string;
  presets?: string[];
}) {
  const [tab, setTab] = useState<Tab>("list");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1 rounded-xl bg-muted/60 p-1">
        <button
          onClick={() => setTab("list")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
            tab === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <List size={16} />
          문장 목록
        </button>
        <button
          onClick={() => setTab("quiz")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
            tab === "quiz" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <BookOpen size={16} />
          퀴즈
        </button>
      </div>

      {tab === "quiz" ? (
        <QuizView sentences={sentences} initialStats={stats} initialError={error} />
      ) : (
        <ReviewClient initialSentences={sentences} initialError={error} initialPresets={presets} />
      )}
    </div>
  );
}
