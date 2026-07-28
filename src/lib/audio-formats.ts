// 업로드 오디오 포맷 화이트리스트 — 클라이언트 검증(InputForm/ReviewClient)과
// 서버 액션 검증(saveSentence/updateSentence)이 같은 기준을 쓰도록 한 곳에 둔다.
// 디렉티브 없는 순수 모듈(브라우저·서버 액션 공용).

// mime → 확장자
export const ALLOWED_AUDIO: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
};

export const ALLOWED_EXT = new Set(["mp3", "wav", "m4a", "aac", "ogg", "webm"]);

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB

// 허용 포맷 안내 문구 (에러 메시지 공용)
export const AUDIO_FORMAT_ERROR = "오디오 파일만 업로드할 수 있습니다. (mp3, wav, m4a, aac, ogg, webm)";
export const AUDIO_SIZE_ERROR = "파일 크기는 10MB 이하여야 합니다.";

// ArrayBuffer → base64 (큰 파일도 안전하게 청크 처리)
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}
