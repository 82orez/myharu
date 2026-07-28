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
  // 말하기 속도(0.25~4.0). 미지정이면 API 기본값 1.0.
  // gpt-4o-mini-tts 음색(ash/coral)은 기본 속도가 tts-1보다 눈에 띄게 느려서 여기서 보정한다.
  // ⚠️ 실측 결과 gpt-4o-mini-tts에서도 speed가 정상 동작한다(같은 문장: ash 기본 5.66s → 1.25배 4.78s → 1.4배 3.65s,
  //    tts-1 alloy는 3.6~4.3s). "speed는 무시되고 instructions로만 제어된다"는 문서·포럼 설명은 이 프로젝트 실측과 다르다.
  //    instructions(자연어 지시)로도 시도해 봤지만 5.66s → 5.16s로 효과가 약해 speed를 쓴다.
  speed?: number;
};

// gpt-4o-mini-tts 음색을 tts-1 음색과 비슷한 속도로 맞추는 배속. 체감이 빠르거나 느리면 이 값만 조정한다.
const NEW_VOICE_SPEED = 1.25;

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
