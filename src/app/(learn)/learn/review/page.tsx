import type { Metadata } from "next";
import { getSentences } from "./actions";
import { getTagPresets } from "../tag-actions";
import LearnModeTabs from "@/components/learn/LearnModeTabs";
import ReviewClient from "@/components/learn/ReviewClient";

export const metadata: Metadata = {
  title: "문장 목록",
  robots: { index: false },
};

export default async function ReviewPage() {
  const [sentencesResult, presets] = await Promise.all([getSentences(), getTagPresets()]);

  return (
    <main className="mx-auto min-h-[calc(100vh-200px)] max-w-2xl px-4 py-8">
      <div className="flex flex-col gap-6">
        <LearnModeTabs />
        <ReviewClient initialSentences={sentencesResult.sentences ?? []} initialError={sentencesResult.error} initialPresets={presets} />
      </div>
    </main>
  );
}
