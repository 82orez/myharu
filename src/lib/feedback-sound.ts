// 정답/오답 알림음 — 짧은 톤을 코드로 합성해 재생한다(에셋 파일 없음).
//
// ⚠️ 재생에 Web Audio(AudioContext)를 쓰지 말 것.
//    알림음이 울리는 시점은 "음성 인식 직후"인데, iOS는 마이크가 오디오 세션을 잡으면
//    AudioContext가 WebKit 전용 "interrupted" 상태가 되어 예외 없이 무음이 된다
//    (hooks/use-audio-player.ts의 2개 엘리먼트 구조와 같은 이유).
//    그래서 샘플은 순수 JS로 계산하고(오실레이터·OfflineAudioContext 금지),
//    WAV로 인코딩해 Web Audio에 연결되지 않은 plain HTMLAudioElement로 재생한다.

import { arrayBufferToBase64 } from "@/lib/audio-formats";

export type FeedbackSoundKind = "correct" | "incorrect";

const STORAGE_KEY = "myharu:feedback-sound";
const SAMPLE_RATE = 44100;
const PEAK = 0.35; // 문장 음성보다 크지 않게

// 음 하나: 주파수(Hz)와 길이(초)
type Tone = { freq: number; duration: number };

// 정답은 상승 2음, 오답은 낮은 하강 2음
const TONES: Record<FeedbackSoundKind, Tone[]> = {
  correct: [
    { freq: 880, duration: 0.09 }, // A5
    { freq: 1318.5, duration: 0.16 }, // E6
  ],
  incorrect: [
    { freq: 320, duration: 0.14 },
    { freq: 200, duration: 0.16 },
  ],
};

// 사인파 + 짧은 attack/지수 감쇠 엔벨로프 (클릭음 방지)
function renderTones(tones: Tone[]): Float32Array {
  const total = tones.reduce((sum, t) => sum + Math.round(t.duration * SAMPLE_RATE), 0);
  const out = new Float32Array(total);

  let offset = 0;
  for (const tone of tones) {
    const length = Math.round(tone.duration * SAMPLE_RATE);
    const attack = Math.min(Math.round(0.005 * SAMPLE_RATE), length);
    for (let i = 0; i < length; i++) {
      const t = i / SAMPLE_RATE;
      const decay = Math.exp((-3.5 * i) / length);
      const gate = i < attack ? i / attack : 1;
      out[offset + i] = Math.sin(2 * Math.PI * tone.freq * t) * decay * gate * PEAK;
    }
    offset += length;
  }
  return out;
}

// Float32 샘플 → 16-bit PCM WAV (헤더 44B)
function encodeWav(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true); // fmt 청크 크기
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // 모노
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bit depth
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  return buffer;
}

// 종류별 엘리먼트는 한 번만 만들어 재사용한다
const elements = new Map<FeedbackSoundKind, HTMLAudioElement>();

function getElement(kind: FeedbackSoundKind): HTMLAudioElement | null {
  const cached = elements.get(kind);
  if (cached) return cached;

  try {
    // ⚠️ blob: URL이 아니라 data: URI를 쓴다 — iOS Safari의 미디어 로더는 blob: URL 오디오를
    //    재생하지 못하는 경우가 있다(예외 없이 무음). 몇십 KB라 인라인해도 부담이 없다.
    const el = new Audio(`data:audio/wav;base64,${arrayBufferToBase64(encodeWav(renderTones(TONES[kind])))}`);
    el.preload = "auto";
    elements.set(kind, el);
    return el;
  } catch {
    return null; // 합성 실패 — 알림음만 포기하고 학습 흐름은 유지
  }
}

// ⚠️ iOS는 엘리먼트마다 "사용자 제스처 안에서 한 번 play()" 되기 전엔 프로그램 재생을 막는다.
//    말하기 채점음은 음성 인식 콜백(제스처 밖)에서 울리므로, 미리 제스처 시점에 무음 재생으로 잠금을 풀어 둔다.
let primed = false;

// 잠금 해제용 무음 재생을 되돌리기까지의 최대 대기(ms)
const PRIME_RESTORE_MS = 400;

export function primeFeedbackSounds(): void {
  if (primed || typeof window === "undefined") return;
  primed = true;

  for (const kind of ["correct", "incorrect"] as const) {
    const el = getElement(kind);
    if (!el) continue;

    // 음소거로 잠깐 재생했다가 즉시 되돌린다.
    // ⚠️ 되돌리기를 play() 프로미스에만 맡기면 안 된다 — 백그라운드 탭처럼 미디어 로딩이 지연되는 환경에선
    //    프로미스가 영영 resolve되지 않아 엘리먼트가 음소거인 채로 굳는다(= 이후 채점음이 전부 무음).
    const restore = () => {
      try {
        el.pause();
        el.currentTime = 0;
      } catch {
        // 무시
      }
      el.muted = false;
    };

    try {
      el.muted = true;
      void Promise.resolve(el.play()).then(restore).catch(restore);
      setTimeout(restore, PRIME_RESTORE_MS);
    } catch {
      restore();
    }
  }
}

// 페이지의 첫 사용자 입력에서 잠금 해제. 반환값은 정리 함수(useEffect cleanup).
export function installFeedbackSoundUnlock(): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = () => primeFeedbackSounds();
  const events = ["pointerdown", "touchend", "keydown"] as const;
  for (const type of events) window.addEventListener(type, handler, { once: true, passive: true });

  return () => {
    for (const type of events) window.removeEventListener(type, handler);
  };
}

export function isFeedbackSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true; // localStorage 사용 불가(프라이빗 모드 등) — 켜짐으로 간주
  }
}

export function setFeedbackSoundEnabled(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, "off");
  } catch {
    // 저장 실패는 무시 — 이번 세션에서만 반영되지 않는다
  }
}

// 꺼져 있거나 재생에 실패하면 조용히 no-op
export function playFeedbackSound(kind: FeedbackSoundKind): void {
  if (typeof window === "undefined") return;
  // 매 재생마다 읽는다 — 다른 탭에서 설정을 바꿔도 즉시 반영된다
  if (!isFeedbackSoundEnabled()) return;

  const el = getElement(kind);
  if (!el) return;

  try {
    el.muted = false; // 잠금 해제(primeFeedbackSounds)가 덜 되돌아간 경우 대비
    el.currentTime = 0;
    void el.play().catch(() => {});
  } catch {
    // 재생 실패 무시
  }
}
