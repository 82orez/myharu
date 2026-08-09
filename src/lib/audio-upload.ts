// 업로드 직전 오디오 준비 — base64 인코딩 + 라우드니스 측정을 한 묶음으로.
// 디렉티브 없는 순수 모듈이지만 내부가 btoa/AudioContext에 의존하므로 **클라이언트에서만** 호출할 것.
//
// ⚠️ 존재 이유는 순서 강제다. measureAudioBytes 내부의 decodeAudioData가 ArrayBuffer를 detach 시키므로
//    base64 인코딩이 반드시 먼저 끝나야 한다. 이 순서는 과거 InputForm·ReviewClient 두 곳에 주석까지
//    복사되어 있었다 — 호출부에서 다시 풀어쓰지 말고 이 함수를 쓸 것.
import { measureAudioBytes, type AudioStats } from "@/lib/audio-loudness";
import { arrayBufferToBase64 } from "@/lib/audio-formats";

export type PreparedAudio = { base64: string; stats: AudioStats | null };

export async function prepareAudioBuffer(buffer: ArrayBuffer): Promise<PreparedAudio> {
  const base64 = arrayBufferToBase64(buffer);
  // 측정 실패는 null로 두고 저장 자체는 막지 않는다(재생 시 게인 1.0).
  const stats = await measureAudioBytes(buffer);
  return { base64, stats };
}
