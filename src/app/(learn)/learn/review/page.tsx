import type { Metadata } from "next";
import { getSentences } from "./actions";
import { getUserStats } from "./gamification-actions";
import ReviewTabs from "@/components/learn/ReviewTabs";

export const metadata: Metadata = {
  title: "학습",
  robots: { index: false },
};

export default async function ReviewPage() {
  const [sentencesResult, statsResult] = await Promise.all([getSentences(), getUserStats()]);

  return (
    <main className="mx-auto min-h-[calc(100vh-200px)] max-w-2xl px-4 py-8">
      <ReviewTabs sentences={sentencesResult.sentences ?? []} stats={statsResult.stats} error={sentencesResult.error} />
    </main>
  );
}
