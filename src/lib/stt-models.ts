// STT(음성→텍스트) 인식 모델. 클라이언트(SaveSentenceDialog)와 라우트(/api/stt)가 공유하므로
// 디렉티브 없는 순수 모듈로 둔다. 선택값은 기기별 설정이라 localStorage에 저장한다.

const STORAGE_KEY = "myharu:stt-model";

export const STT_MODELS = [
  { id: "whisper-1", label: "Whisper", desc: "기본 · 빠름" },
  { id: "gpt-4o-mini-transcribe", label: "GPT-4o mini", desc: "정확도 개선" },
  { id: "gpt-4o-transcribe", label: "GPT-4o", desc: "가장 정확" },
] as const;

export type SttModelId = (typeof STT_MODELS)[number]["id"];

export const DEFAULT_STT_MODEL: SttModelId = "whisper-1";

// ⚠️ srt/vtt/verbose_json 출력은 whisper-1 전용 — gpt-4o-transcribe 계열은 json만 지원한다.
export const SUBTITLE_STT_MODEL: SttModelId = "whisper-1";

export function isValidSttModel(value: unknown): value is SttModelId {
  return typeof value === "string" && STT_MODELS.some((m) => m.id === value);
}

/** 저장된 인식 모델. 미설정·손상값·SSR이면 기본값. */
export function getSttModel(): SttModelId {
  if (typeof window === "undefined") return DEFAULT_STT_MODEL;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isValidSttModel(raw) ? raw : DEFAULT_STT_MODEL;
  } catch {
    return DEFAULT_STT_MODEL;
  }
}

export function setSttModel(model: SttModelId): void {
  if (!isValidSttModel(model)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, model);
  } catch {
    // localStorage 사용 불가(프라이빗 모드 등) — 이번 세션에만 유지된다
  }
}
