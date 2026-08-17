// 클라이언트 → /api/stt 호출을 한곳에 모은다(퀴즈·학습 모드의 말하기 녹음, Repeater의 구간 저장 공용).
// 라우트가 허용 모델·형식을 검증하므로 여기서는 전송 형태만 맞춘다.

import { getSttModel, type SttModelId } from "@/lib/stt-models";

export type TranscribeResult = { text: string } | { error: string };

/**
 * 오디오 Blob을 텍스트로 변환. `filename`의 확장자로 포맷을 알리므로 실제 녹음 포맷과 맞출 것
 * (iOS Safari는 webm이 아니라 mp4로 녹음된다 — 확장자가 틀리면 OpenAI가 거부한다).
 */
export async function transcribeClip(blob: Blob, filename: string, model: SttModelId = getSttModel()): Promise<TranscribeResult> {
  try {
    const form = new FormData();
    form.append("file", new File([blob], filename, { type: blob.type || "application/octet-stream" }));
    form.append("model", model);
    form.append("format", "text");

    const res = await fetch("/api/stt", { method: "POST", body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { error: data?.error ?? "텍스트 추출에 실패했습니다." };
    }
    return { text: String(data?.text ?? "").trim() };
  } catch {
    return { error: "텍스트 추출 중 오류가 발생했습니다." };
  }
}
