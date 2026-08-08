"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SPEED, isValidSpeed } from "@/lib/tts-voices";

const STORAGE_KEY = "myharu:tts-speed";

// 마지막으로 선택한 말하기 배율을 localStorage에 기억한다.
// SSR/hydration 안전: 초기값은 DEFAULT_SPEED, mount 후 localStorage 값으로 보정.
export function useSelectedSpeed(): [number, (speed: number) => void] {
  const [speed, setSpeedState] = useState<number>(DEFAULT_SPEED);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    if (isValidSpeed(stored)) {
      setSpeedState(stored);
    }
  }, []);

  const setSpeed = (next: number) => {
    setSpeedState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // localStorage 사용 불가(프라이빗 모드 등) — 세션 내 state로만 유지
    }
  };

  return [speed, setSpeed];
}
