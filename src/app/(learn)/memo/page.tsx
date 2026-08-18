import type { Metadata } from "next";
import { getMemos } from "@/app/(learn)/memo/actions";
import MemoClient from "@/components/memo/MemoClient";

export const metadata: Metadata = {
  title: "메모",
  robots: { index: false },
};

// 로그인 가드는 (learn) 그룹 레이아웃이 담당한다 — 여기서 다시 검사하지 않는다.
export default async function MemoPage() {
  const { memos, error } = await getMemos();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">메모</h1>
      <MemoClient initialMemos={memos ?? []} initialError={error} />
    </main>
  );
}
