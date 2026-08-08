// OpenAI TTS 음성 목록 (tts-1 기본 3종 + gpt-4o-mini-tts 전용 신규 2종).
// 클라이언트(VoicePicker)와 서버(generateAudio 검증) 양쪽에서 import → "server-only" 금지.

export type TtsVoiceId = "alloy" | "onyx" | "nova" | "ash" | "coral";

export type TtsModel = "tts-1" | "gpt-4o-mini-tts";

export type TtsVoice = {
  id: TtsVoiceId;
  label: string;
  gender: "남성" | "여성" | "중성";
  accent: "미국식" | "영국식";
  desc: string;
  // 미지정이면 DEFAULT_TTS_MODEL. 신규 음색은 tts-1에서 품질이 보장되지 않아 모델을 따로 지정한다.
  model?: TtsModel;
  // 음색별 속도 보정값. 미지정이면 1.0(보정 없음).
  // ⚠️ 사용자 설정이 아니라 "음색 정규화" 전용 — 사용자가 고른 배율과 곱해져 최종 API speed가 된다(resolveTtsSpeed).
  // gpt-4o-mini-tts 음색(ash/coral)은 기본 속도가 tts-1보다 눈에 띄게 느려서 여기서 보정한다.
  // ⚠️ 실측 결과 gpt-4o-mini-tts에서도 speed가 정상 동작한다(같은 문장: ash 기본 5.66s → 1.25배 4.78s → 1.4배 3.65s,
  //    tts-1 alloy는 3.6~4.3s). "speed는 무시되고 instructions로만 제어된다"는 문서·포럼 설명은 이 프로젝트 실측과 다르다.
  //    instructions(자연어 지시)로도 시도해 봤지만 5.66s → 5.16s로 효과가 약해 speed를 쓴다.
  speed?: number;
};

// gpt-4o-mini-tts 음색을 tts-1 음색과 비슷한 속도로 맞추는 배속(음색 정규화 전용).
// 사용자가 고르는 빠르기는 SPEED_OPTIONS이고, 이 값과 곱해진다 — 여기서 사용자 취향을 반영하지 말 것.
const NEW_VOICE_SPEED = 1.6;

// 사용자가 고르는 말하기 배율. 음색별 보정값(TtsVoice.speed)에 곱해져 최종 API speed가 된다.
// 1~1.25배를 0.05 단위로 — 체감 차이가 큰 구간이라 촘촘하게 둔다. desc는 양 끝만(중간값은 숫자로 충분).
export const SPEED_OPTIONS = [
  { value: 1, label: "1배", desc: "기본 속도" },
  { value: 1.05, label: "1.05배", desc: "" },
  { value: 1.1, label: "1.1배", desc: "" },
  { value: 1.15, label: "1.15배", desc: "" },
  { value: 1.2, label: "1.2배", desc: "" },
  { value: 1.25, label: "1.25배", desc: "가장 빠르게" },
] as const;

export const DEFAULT_SPEED = 1;

// OpenAI TTS가 받는 speed 범위
const MIN_API_SPEED = 0.25;
const MAX_API_SPEED = 4.0;

export const TTS_VOICES: TtsVoice[] = [
  { id: "alloy", label: "Alloy", gender: "중성", accent: "미국식", desc: "중성적이고 균형 잡힌 톤" },
  { id: "onyx", label: "Onyx", gender: "남성", accent: "미국식", desc: "깊고 무게감 있는 톤" },
  { id: "nova", label: "Nova", gender: "여성", accent: "미국식", desc: "밝고 활기찬 톤" },
  {
    id: "ash",
    label: "Ash",
    gender: "남성",
    accent: "미국식",
    desc: "차분하고 또렷한 톤",
    model: "gpt-4o-mini-tts",
    speed: NEW_VOICE_SPEED,
  },
  {
    id: "coral",
    label: "Coral",
    gender: "여성",
    accent: "미국식",
    desc: "따뜻하고 친근한 톤",
    model: "gpt-4o-mini-tts",
    speed: NEW_VOICE_SPEED,
  },
];

export const DEFAULT_VOICE: TtsVoiceId = "alloy";

export const DEFAULT_TTS_MODEL: TtsModel = "tts-1";

const VOICE_IDS = new Set<string>(TTS_VOICES.map((v) => v.id));

export function isValidVoice(value: unknown): value is TtsVoiceId {
  return typeof value === "string" && VOICE_IDS.has(value);
}

export function voiceLabel(id: TtsVoiceId): string {
  return TTS_VOICES.find((v) => v.id === id)?.label ?? id;
}

export function voiceModel(id: TtsVoiceId): TtsModel {
  return TTS_VOICES.find((v) => v.id === id)?.model ?? DEFAULT_TTS_MODEL;
}

export function voiceSpeed(id: TtsVoiceId): number | undefined {
  return TTS_VOICES.find((v) => v.id === id)?.speed;
}

const SPEED_VALUES = new Set<number>(SPEED_OPTIONS.map((s) => s.value));

export function isValidSpeed(value: unknown): value is number {
  return typeof value === "number" && SPEED_VALUES.has(value);
}

export function speedLabel(speed: number): string {
  return SPEED_OPTIONS.find((s) => s.value === speed)?.label ?? `${speed}배`;
}

/**
 * 음색 보정값 × 사용자 배율 → OpenAI 허용 범위(0.25~4.0)로 clamp.
 * ⚠️ 최종 speed를 만드는 곳은 여기 하나뿐 — 다른 곳에서 다시 계산하지 말 것.
 */
export function resolveTtsSpeed(voice: TtsVoiceId, userSpeed?: number): number {
  const base = voiceSpeed(voice) ?? 1;
  const factor = isValidSpeed(userSpeed) ? userSpeed : DEFAULT_SPEED;
  return Math.min(Math.max(base * factor, MIN_API_SPEED), MAX_API_SPEED);
}
