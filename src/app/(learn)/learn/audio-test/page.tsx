import type { Metadata } from "next";
import { getSentences } from "../review/actions";
import AudioTestClient from "@/components/learn/AudioTestClient";

// 임시 진단 페이지 — iOS에서 "듣기" 앞부분이 잘리는 원인을 재생 방식별로 가려내기 위한 것.
// 원인이 확정되고 수정이 끝나면 이 라우트와 AudioTestClient는 삭제한다.
export const metadata: Metadata = {
  title: "오디오 재생 진단",
  robots: { index: false },
};

export default async function AudioTestPage() {
  const { sentences = [], error } = await getSentences();

  return (
    <main className="mx-auto min-h-[calc(100vh-200px)] max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-xl font-bold">오디오 재생 진단</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        같은 문장을 5가지 방식으로 재생합니다. 아이폰에서 각각 눌러보고 <strong>첫 단어가 잘리는지</strong>를 확인해 주세요.
      </p>
      {error ? <p className="text-destructive text-sm">{error}</p> : <AudioTestClient sentences={sentences.slice(0, 8)} />}
    </main>
  );
}
