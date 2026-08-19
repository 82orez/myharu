// D-day(목표일까지 남은 일수) 공용 로직. 설정 폼·서버 액션·Navbar 배지가 함께 쓰므로
// 디렉티브 없는 순수 모듈로 둔다. 날짜는 모두 KST `YYYY-MM-DD` 문자열.

// gamification.ts의 todayKST는 "server-only"라 클라이언트에서 못 쓴다 → 순수 사본인 todo.ts 것을 재사용.
import { todayKST } from "@/lib/todo";

// D-day 이름 최대 길이. DB CHECK(add_dday_to_user_stats)와 같은 값을 유지할 것.
export const MAX_DDAY_LABEL = 20;

/** `YYYY-MM-DD` 형식이면서 실재하는 날짜인지 검사(2026-02-31 같은 값을 거른다). */
export function isValidDdayDate(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const d = new Date(`${raw}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw;
}

/**
 * 오늘(KST) → 목표일 남은 일수. 양수=미래, 0=당일, 음수=지난 뒤.
 * todo.ts의 nextDueDate와 같이 정오 기준으로 파싱해 서머타임·타임존 경계에서 하루가 밀리지 않게 한다.
 */
export function ddayDiff(target: string, today: string = todayKST()): number {
  const t = new Date(`${target}T12:00:00Z`).getTime();
  const n = new Date(`${today}T12:00:00Z`).getTime();
  return Math.round((t - n) / 86_400_000);
}

/** 남은 일수 → 배지 문구. 양수 `D-42`, 0 `D-DAY`, 음수 `D+3`. */
export function formatDday(diff: number): string {
  if (diff === 0) return "D-DAY";
  return diff > 0 ? `D-${diff}` : `D+${-diff}`;
}

// 기간 입력 프리셋(일). 설정 폼에서 칩으로 노출한다.
export const DDAY_PERIOD_PRESETS = [20, 50, 100, 200, 300];
export const MIN_DDAY_PERIOD = 1;
export const MAX_DDAY_PERIOD = 3650; // 10년

/**
 * 오늘(KST)로부터 `days`일 뒤의 `YYYY-MM-DD`.
 * ⚠️ 오늘을 세지 않는 정의라 `ddayDiff(dateAfterDays(N)) === N` — 입력한 숫자가 그대로 배지 `D-N`이 된다.
 * 이 불변식을 깨지 말 것(오늘 포함 방식으로 바꾸면 "20일"을 넣었는데 D-19가 뜬다).
 */
export function dateAfterDays(days: number, today: string = todayKST()): string {
  const d = new Date(`${today}T12:00:00Z`); // nextDueDate·ddayDiff와 같은 정오 기준
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
