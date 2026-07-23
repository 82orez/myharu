// 학습 설정 상수. 서버 액션·서버 컴포넌트·클라이언트 폼이 공유하므로
// "use server"/"server-only" 디렉티브 없는 순수 모듈로 둔다.

// 하루 목표 연습(정답) 횟수. 고정값이며 사용자가 변경할 수 없다.
export const DAILY_PRACTICE_GOAL = 1000;

// "자신에게 한 마디"(personal_message) 최대 길이
export const MAX_PERSONAL_MESSAGE = 100;

// "자신에게 한 마디" 기본 문구. 사용자가 비워 두면 홈에서 이 값으로 표시한다.
export const DEFAULT_PERSONAL_MESSAGE = "Do your best!";
