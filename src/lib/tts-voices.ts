// OpenAI TTS 음성 목록 (모델 tts-1 안정 지원 6종).
// 클라이언트(VoicePicker)와 서버(generateAudio 검증) 양쪽에서 import → "server-only" 금지.

export type TtsVoiceId = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

export type TtsVoice = {
  id: TtsVoiceId;
  label: string;
  gender: "남성" | "여성" | "중성";
  accent: "미국식" | "영국식";
  desc: string;
};

export const TTS_VOICES: TtsVoice[] = [
  { id: "alloy", label: "Alloy", gender: "중성", accent: "미국식", desc: "중성적이고 균형 잡힌 톤" },
  { id: "echo", label: "Echo", gender: "남성", accent: "미국식", desc: "명확하고 또렷한 톤" },
  { id: "fable", label: "Fable", gender: "남성", accent: "영국식", desc: "이야기체의 부드러운 톤" },
  { id: "onyx", label: "Onyx", gender: "남성", accent: "미국식", desc: "깊고 무게감 있는 톤" },
  { id: "nova", label: "Nova", gender: "여성", accent: "미국식", desc: "밝고 활기찬 톤" },
  { id: "shimmer", label: "Shimmer", gender: "여성", accent: "미국식", desc: "맑고 경쾌한 톤" },
];

export const DEFAULT_VOICE: TtsVoiceId = "alloy";

const VOICE_IDS = new Set<string>(TTS_VOICES.map((v) => v.id));

export function isValidVoice(value: unknown): value is TtsVoiceId {
  return typeof value === "string" && VOICE_IDS.has(value);
}
