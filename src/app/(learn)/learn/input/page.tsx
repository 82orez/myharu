import type { Metadata } from "next";
import InputForm from "@/components/learn/InputForm";
import { getUserTags } from "./actions";

export const metadata: Metadata = {
  title: "문장 입력",
  robots: { index: false },
};

export default async function InputPage() {
  const suggestedTags = await getUserTags();

  return (
    <main className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-muted/30 px-6 py-16">
      <InputForm suggestedTags={suggestedTags} />
    </main>
  );
}
