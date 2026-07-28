"use client";

import { useEffect, useState } from "react";
import { isFeedbackSoundEnabled, playFeedbackSound, setFeedbackSoundEnabled } from "@/lib/feedback-sound";
import { Button } from "@/components/ui/button";

// 정답·오답 알림음 켜기/끄기 — localStorage에 저장(기기별 설정)이라 서버 액션 없이 즉시 반영.
// SSR 안전: 초기값 켜짐 → mount 후 저장값으로 보정(use-selected-voice와 동일 패턴).
export default function FeedbackSoundField() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(isFeedbackSoundEnabled());
  }, []);

  function save(next: boolean) {
    if (next === enabled) return;
    setEnabled(next);
    setFeedbackSoundEnabled(next);
    // 켜면 바로 어떤 소리인지 들려준다
    if (next) playFeedbackSound("correct");
  }

  return (
    <div className="flex shrink-0 gap-2">
      <Button variant={enabled ? "brand" : "outline"} size="sm" onClick={() => save(true)}>
        켜기
      </Button>
      <Button variant={enabled ? "outline" : "brand"} size="sm" onClick={() => save(false)}>
        끄기
      </Button>
    </div>
  );
}
