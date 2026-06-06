export type UserStats = {
  user_id: string;
  total_xp: number;
  daily_goal: number;
  created_at: string;
};

export type QuizMode = "speech" | "text";

export type PracticeResult = {
  id: string;
  sentence_id: string;
  is_correct: boolean;
  xp_earned: number;
  mode: QuizMode;
  practiced_at: string;
};

export type SessionSummary = {
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  xpEarned: number;
  accuracy: number;
};
