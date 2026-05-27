import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getSentences } from "./actions";
import { getUserStats } from "./gamification-actions";
import QuizView from "@/components/learn/QuizView";

export const metadata: Metadata = {
  title: "복습",
  robots: { index: false },
};

type SearchParams = Promise<{ date?: string }>;

export default async function ReviewPage({ searchParams }: { searchParams: SearchParams }) {
  const { date } = await searchParams;
  const [sentencesResult, statsResult] = await Promise.all([getSentences(date), getUserStats()]);

  return (
    <main className="mx-auto min-h-[calc(100vh-200px)] max-w-2xl px-4 py-8">
      <QuizView sentences={sentencesResult.sentences ?? []} initialStats={statsResult.stats} initialError={sentencesResult.error} dateFilter={date} />
    </main>
  );
}
