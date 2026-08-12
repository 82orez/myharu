import type { Metadata } from "next";
import Player from "@/components/player/Player";
import { getTagPresets } from "../tag-actions";

export const metadata: Metadata = {
  title: "Repeater",
  robots: { index: false },
};

// 인증 가드는 (learn)/layout.tsx가 처리한다 — 여기서 getUser를 다시 부르지 않는다.
export default async function PlayerPage() {
  // 저장 다이얼로그의 TagPicker가 쓰는 프리셋. 플레이어 자체는 서버 데이터가 필요 없다.
  const presets = await getTagPresets();

  return (
    <main className="bg-muted/30 min-h-[calc(100vh-200px)]">
      <Player initialPresets={presets} />
    </main>
  );
}
