// 오디오 볼륨 균일화 — 측정/게인 계산 공용 모듈.
//
// 브라우저(InputForm·ReviewClient), 서버 액션, Node 백필 스크립트(scripts/measure-loudness.mjs)가
// 모두 import 한다 → "server-only" 금지, 외부 의존성 0.
//
// 원칙: 원본 오디오 파일은 절대 건드리지 않는다. 파일별 측정값(loudness_db·peak_db)만 DB에 저장하고,
// 재생 시점에 computeGain()으로 배율을 구해 Web Audio GainNode에 적용한다.
// 파생값(게인)이 아니라 원측정값을 저장하므로, 아래 상수만 바꾸면 재스캔 없이 목표 레벨을 재조정할 수 있다.

/** 목표 라우드니스(dBFS). 모든 문장이 이 레벨로 수렴한다. */
export const TARGET_RMS_DB = -20;
/** 이 크기 이하의 샘플은 RMS 계산에서 제외 — 앞뒤 무음이 긴 녹음이 "조용한 파일"로 오측정되는 것을 막는다. */
export const SILENCE_GATE_DB = -50;
/** 증폭 후 허용할 최대 피크. 클리핑 방지 헤드룸. */
export const PEAK_CEILING_DB = -1;
export const MIN_GAIN_DB = -12;
export const MAX_GAIN_DB = 12;

/** 완전 무음 등으로 dB가 -Infinity가 되는 것을 막는 하한. */
const DB_FLOOR = -100;

export type AudioStats = { loudnessDb: number; peakDb: number };

function toDb(amplitude: number): number {
  if (!(amplitude > 0)) return DB_FLOOR;
  return Math.max(DB_FLOOR, 20 * Math.log10(amplitude));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 모노 Float32 샘플 → 라우드니스/피크 측정값.
 * 브라우저(decodeAudioData 결과)와 Node 스크립트(ffmpeg raw PCM) 공통 진입점 —
 * 과거 데이터와 신규 데이터가 반드시 같은 알고리즘으로 측정되도록 여기 하나만 사용한다.
 */
export function measureSamples(samples: Float32Array): AudioStats {
  const gate = Math.pow(10, SILENCE_GATE_DB / 20);

  let peak = 0;
  let gatedSum = 0;
  let gatedCount = 0;
  let totalSum = 0;

  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
    const square = abs * abs;
    totalSum += square;
    if (abs > gate) {
      gatedSum += square;
      gatedCount++;
    }
  }

  // 게이트를 통과한 샘플이 없으면(=사실상 무음) 전체 샘플로 폴백한다.
  const rms = gatedCount > 0 ? Math.sqrt(gatedSum / gatedCount) : samples.length > 0 ? Math.sqrt(totalSum / samples.length) : 0;

  return { loudnessDb: toDb(rms), peakDb: toDb(peak) };
}

/**
 * 저장된 측정값 → 재생 게인 배율. 미측정(NULL)이거나 값이 이상하면 1(보정 없음).
 * 목표 레벨까지 올리되, 피크가 PEAK_CEILING_DB를 넘지 않는 선에서 멈춘다.
 */
export function computeGain(loudnessDb: number | null | undefined, peakDb: number | null | undefined): number {
  if (!Number.isFinite(loudnessDb) || !Number.isFinite(peakDb)) return 1;

  const desiredDb = TARGET_RMS_DB - (loudnessDb as number);
  const ceilingDb = PEAK_CEILING_DB - (peakDb as number);
  const gainDb = clamp(Math.min(desiredDb, ceilingDb), MIN_GAIN_DB, MAX_GAIN_DB);

  return Math.pow(10, gainDb / 20);
}

/** 서버 액션에서 클라이언트가 보낸 측정값을 신뢰하기 전 검증한다. 유효하지 않으면 null. */
export function sanitizeAudioStats(stats: unknown): AudioStats | null {
  if (!stats || typeof stats !== "object") return null;
  const { loudnessDb, peakDb } = stats as Partial<AudioStats>;
  if (!Number.isFinite(loudnessDb) || !Number.isFinite(peakDb)) return null;
  if (loudnessDb > 0 || peakDb > 0) return null; // dBFS는 0을 넘을 수 없다
  return { loudnessDb: loudnessDb as number, peakDb: peakDb as number };
}

/**
 * 브라우저 전용: 인코딩된 오디오 바이트 → 측정값.
 *
 * ⚠️ decodeAudioData는 전달받은 ArrayBuffer를 detach 시킨다. 호출부에서 같은 버퍼를 계속 써야 한다면
 * 반드시 사본을 넘길 것 — 이 함수는 방어적으로 내부에서 slice(0) 한 사본을 디코딩한다.
 *
 * 측정 실패가 저장 자체를 막으면 안 되므로 예외 대신 null을 반환한다.
 */
export async function measureAudioBytes(bytes: ArrayBuffer): Promise<AudioStats | null> {
  if (typeof window === "undefined") return null;

  const Ctx: typeof AudioContext | undefined = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctx) return null;

  const ctx = new Ctx();
  try {
    const buffer = await ctx.decodeAudioData(bytes.slice(0));

    // 채널 평균으로 모노 다운믹스 (Node 쪽 ffmpeg -ac 1 과 동일한 취급)
    const length = buffer.length;
    const channels = buffer.numberOfChannels;
    const mono = new Float32Array(length);
    for (let c = 0; c < channels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) mono[i] += data[i];
    }
    if (channels > 1) {
      for (let i = 0; i < length; i++) mono[i] /= channels;
    }

    return measureSamples(mono);
  } catch {
    return null;
  } finally {
    void ctx.close();
  }
}
