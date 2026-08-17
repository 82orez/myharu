"use client";

import { useEffect, useState } from "react";
import { DEFAULT_STT_MODEL, STT_MODELS, getSttModel, setSttModel, type SttModelId } from "@/lib/stt-models";

// 음성→텍스트 인식 모델 — localStorage에 저장(기기별 설정)이라 서버 액션 없이 즉시 반영.
// 말하기 채점(서버 STT 경로)과 Repeater의 "영어 자동 채우기"가 같은 값을 공유한다.
// SSR 안전: 초기값 기본 모델 → mount 후 저장값으로 보정(FeedbackSoundField와 동일 패턴).
export default function SttModelField() {
  const [model, setModelState] = useState<SttModelId>(DEFAULT_STT_MODEL);

  useEffect(() => {
    setModelState(getSttModel());
  }, []);

  return (
    <select
      value={model}
      onChange={(e) => {
        const id = e.target.value as SttModelId;
        setModelState(id);
        setSttModel(id);
      }}
      aria-label="음성 인식 모델"
      className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/20 h-8 shrink-0 rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]">
      {STT_MODELS.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label} · {m.desc}
        </option>
      ))}
    </select>
  );
}
