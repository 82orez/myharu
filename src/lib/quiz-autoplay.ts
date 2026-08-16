// 리스닝 퀴즈 자동 재생 지연(초). 기기별 설정이라 DB가 아닌 localStorage에 저장한다
// (feedback-sound와 같은 계열 — 디렉티브 없는 브라우저 모듈).

const STORAGE_KEY = "myharu:quiz-autoplay-delay";

export const AUTOPLAY_DELAY_OPTIONS = [0, 1, 2, 3] as const;
export const DEFAULT_AUTOPLAY_DELAY = 1;

function isValidDelay(value: number): boolean {
  return (AUTOPLAY_DELAY_OPTIONS as readonly number[]).includes(value);
}

/**
 * 저장된 지연(초). 미설정·손상값·SSR이면 기본값.
 * ⚠️ 0이 유효값이라 `Number(getItem(...))`만 쓰면 미설정(null→0)이 기본값을 덮어쓴다 — raw를 먼저 확인할 것.
 */
export function getAutoPlayDelay(): number {
  if (typeof window === "undefined") return DEFAULT_AUTOPLAY_DELAY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_AUTOPLAY_DELAY;
    const parsed = Number(raw);
    return isValidDelay(parsed) ? parsed : DEFAULT_AUTOPLAY_DELAY;
  } catch {
    return DEFAULT_AUTOPLAY_DELAY;
  }
}

export function setAutoPlayDelay(seconds: number): void {
  if (!isValidDelay(seconds)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(seconds));
  } catch {
    // localStorage 사용 불가(프라이빗 모드 등) — 이번 세션에만 유지된다
  }
}
