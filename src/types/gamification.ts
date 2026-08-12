import type { Tables } from "@/types/database.types";

// 모드는 DB에서 text CHECK 제약이라 생성 타입은 string으로 나옴 → 앱 레벨에서 union으로 좁힌다.
// QuizMode = 사용자가 고르는 채점 모드(퀴즈 UI의 선택지). 'listen'은 선택지가 아니라 듣기 재생 기록이므로 분리한다.
export type QuizMode = "speech" | "text";
export type PracticeMode = QuizMode | "listen";

// user_stats Row 그대로 (생성 타입에서 파생 — 컬럼 추가 시 자동 반영)
export type UserStats = Tables<"user_stats">;

// practice_results Row에서 mode만 PracticeMode로 좁힘
export type PracticeResult = Omit<Tables<"practice_results">, "mode"> & { mode: PracticeMode };

// DB 테이블이 아닌 앱 계산 전용(세션 요약) 타입
export type SessionSummary = {
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  accuracy: number;
};
