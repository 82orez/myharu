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
};

export const TTS_VOICES: TtsVoice[] = [
  { id: "alloy", label: "Alloy", gender: "중성", accent: "미국식", desc: "중성적이고 균형 잡힌 톤" },
  { id: "onyx", label: "Onyx", gender: "남성", accent: "미국식", desc: "깊고 무게감 있는 톤" },
  { id: "nova", label: "Nova", gender: "여성", accent: "미국식", desc: "밝고 활기찬 톤" },
  { id: "ash", label: "Ash", gender: "남성", accent: "미국식", desc: "차분하고 또렷한 톤", model: "gpt-4o-mini-tts" },
  { id: "coral", label: "Coral", gender: "여성", accent: "미국식", desc: "따뜻하고 친근한 톤", model: "gpt-4o-mini-tts" },
];

export const DEFAULT_VOICE: TtsVoiceId = "alloy";

export const DEFAULT_TTS_MODEL: TtsModel = "tts-1";

const VOICE_IDS = new Set<string>(TTS_VOICES.map((v) => v.id));

export function isValidVoice(value: unknown): value is TtsVoiceId {
  return typeof value === "string" && VOICE_IDS.has(value);
}

export function voiceModel(id: TtsVoiceId): TtsModel {
  return TTS_VOICES.find((v) => v.id === id)?.model ?? DEFAULT_TTS_MODEL;
}
