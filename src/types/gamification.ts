import type { Tables } from "@/types/database.types";

// 모드는 DB에서 text CHECK 제약이라 생성 타입은 string으로 나옴 → 앱 레벨에서 union으로 좁힌다.
export type QuizMode = "speech" | "text";

// user_stats Row 그대로 (생성 타입에서 파생 — 컬럼 추가 시 자동 반영)
export type UserStats = Tables<"user_stats">;

// practice_results Row에서 mode만 QuizMode로 좁힘
export type PracticeResult = Omit<Tables<"practice_results">, "mode"> & { mode: QuizMode };

// DB 테이블이 아닌 앱 계산 전용(세션 요약) 타입
export type SessionSummary = {
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  xpEarned: number;
  accuracy: number;
};
