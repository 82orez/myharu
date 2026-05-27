import type { Metadata } from "next";
import { getSentences } from "./actions";
import ReviewClient from "@/components/learn/ReviewClient";

export const metadata: Metadata = {
  title: "복습",
};

type SearchParams = Promise<{ date?: string }>;

export default async function ReviewPage({ searchParams }: { searchParams: SearchParams }) {
  const { date } = await searchParams;
  const { sentences, error } = await getSentences(date);

  return (
    <main className="mx-auto min-h-[calc(100vh-200px)] max-w-3xl px-6 py-16">
      <ReviewClient initialSentences={sentences ?? []} initialError={error} dateFilter={date} />
    </main>
  );
}
