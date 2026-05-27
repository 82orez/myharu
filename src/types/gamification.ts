export type UserStats = {
  user_id: string;
  total_xp: number;
  current_streak: number;
  longest_streak: number;
  last_practice_date: string | null;
  daily_goal: number;
  created_at: string;
};

export type PracticeResult = {
  id: string;
  sentence_id: string;
  is_correct: boolean;
  xp_earned: number;
  practiced_at: string;
};

export type SessionSummary = {
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  xpEarned: number;
  accuracy: number;
  currentStreak: number;
  isNewStreakDay: boolean;
};
