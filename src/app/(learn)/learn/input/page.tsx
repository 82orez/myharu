import type { Metadata } from "next";
import InputForm from "@/components/learn/InputForm";
import { getTagPresets } from "../tag-actions";

export const metadata: Metadata = {
  title: "문장 입력",
  robots: { index: false },
};

export default async function InputPage() {
  const presets = await getTagPresets();

  return (
    <main className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-muted/30 px-6 py-16">
      <InputForm initialPresets={presets} />
    </main>
  );
}
