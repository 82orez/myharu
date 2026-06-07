import type { Metadata } from "next";
import { getSentences } from "../review/actions";
import { getUserStats } from "../review/gamification-actions";
import LearnModeTabs from "@/components/learn/LearnModeTabs";
import QuizView from "@/components/learn/QuizView";

export const metadata: Metadata = {
  title: "퀴즈",
  robots: { index: false },
};

export default async function QuizPage() {
  const [sentencesResult, statsResult] = await Promise.all([getSentences(), getUserStats()]);

  return (
    <main className="mx-auto min-h-[calc(100vh-200px)] max-w-2xl px-4 py-8">
      <div className="flex flex-col gap-6">
        <LearnModeTabs />
        <QuizView sentences={sentencesResult.sentences ?? []} initialStats={statsResult.stats} initialError={sentencesResult.error} />
      </div>
    </main>
  );
}
