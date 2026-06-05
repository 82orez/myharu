"use client";

import { useEffect, useState } from "react";
import { DEFAULT_VOICE, isValidVoice, type TtsVoiceId } from "@/lib/tts-voices";

const STORAGE_KEY = "myharu:tts-voice";

// 마지막으로 선택한 TTS 음성을 localStorage에 기억한다.
// SSR/hydration 안전: 초기값은 DEFAULT_VOICE, mount 후 localStorage 값으로 보정.
export function useSelectedVoice(): [TtsVoiceId, (voice: TtsVoiceId) => void] {
  const [voice, setVoiceState] = useState<TtsVoiceId>(DEFAULT_VOICE);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isValidVoice(stored)) {
      setVoiceState(stored);
    }
  }, []);

  const setVoice = (next: TtsVoiceId) => {
    setVoiceState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage 사용 불가(프라이빗 모드 등) — 세션 내 state로만 유지
    }
  };

  return [voice, setVoice];
}
