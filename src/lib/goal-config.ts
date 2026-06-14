// 하루 목표(daily_goal) 설정 상수. 서버 액션·서버 컴포넌트·클라이언트 폼이 공유하므로
// "use server"/"server-only" 디렉티브 없는 순수 모듈로 둔다.
export const DEFAULT_DAILY_GOAL = 5;
export const MAX_DAILY_GOAL = 100;

// "자신에게 한 마디"(personal_message) 최대 길이
export const MAX_PERSONAL_MESSAGE = 100;

// "자신에게 한 마디" 기본 문구. 사용자가 비워 두면 홈에서 이 값으로 표시한다.
export const DEFAULT_PERSONAL_MESSAGE = "Do your best!";
