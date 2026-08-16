"use client";

import { useEffect, useState } from "react";
import { AUTOPLAY_DELAY_OPTIONS, DEFAULT_AUTOPLAY_DELAY, getAutoPlayDelay, setAutoPlayDelay } from "@/lib/quiz-autoplay";
import { Button } from "@/components/ui/button";

// 리스닝 퀴즈의 음원 자동 재생 지연 — localStorage에 저장(기기별 설정)이라 서버 액션 없이 즉시 반영.
// SSR 안전: 초기값 기본 지연 → mount 후 저장값으로 보정(FeedbackSoundField와 동일 패턴).
export default function AutoPlayDelayField() {
  const [delay, setDelay] = useState<number>(DEFAULT_AUTOPLAY_DELAY);

  useEffect(() => {
    setDelay(getAutoPlayDelay());
  }, []);

  function save(next: number) {
    if (next === delay) return;
    setDelay(next);
    setAutoPlayDelay(next);
  }

  return (
    <div className="flex shrink-0 gap-2">
      {AUTOPLAY_DELAY_OPTIONS.map((seconds) => (
        <Button key={seconds} variant={seconds === delay ? "brand" : "outline"} size="sm" onClick={() => save(seconds)}>
          {seconds}초
        </Button>
      ))}
    </div>
  );
}
