// 학습 설정 상수. 서버 액션·서버 컴포넌트·클라이언트 폼이 공유하므로
// "use server"/"server-only" 디렉티브 없는 순수 모듈로 둔다.

// 하루 목표 연습(정답) 횟수. 사용자가 /settings에서 변경하며 user_stats.daily_goal에 저장된다.
// MIN/MAX는 DB의 CHECK 제약(add_daily_goal_to_user_stats)과 반드시 같은 값을 유지할 것.
export const DEFAULT_DAILY_GOAL = 1000;
export const MIN_DAILY_GOAL = 1;
export const MAX_DAILY_GOAL = 10000;

/** DB 값·입력값을 유효한 하루 목표로 정규화. null/NaN이면 기본값, 범위 밖이면 clamp. */
export function resolveDailyGoal(raw: number | null | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return DEFAULT_DAILY_GOAL;
  return Math.min(Math.max(Math.round(raw), MIN_DAILY_GOAL), MAX_DAILY_GOAL);
}

// "자신에게 한 마디"(personal_message) 최대 길이
export const MAX_PERSONAL_MESSAGE = 100;

// "자신에게 한 마디" 기본 문구. 사용자가 비워 두면 홈에서 이 값으로 표시한다.
export const DEFAULT_PERSONAL_MESSAGE = "Do your best!";
