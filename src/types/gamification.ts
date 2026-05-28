export type UserStats = {
  user_id: string;
  total_xp: number;
  current_streak: number;
  longest_streak: number;
  last_practice_date: string | null;
  daily_goal: number;
  total_goal: number | null;
  goal_period_days: number | null;
  goal_start_date: string | null;
  created_at: string;
};

export type GoalProgress = {
  memorized: number;
  totalGoal: number;
  periodDays: number;
  startDate: string;
  daysElapsed: number;
  daysRemaining: number;
  dailyMinimum: number;
  percentage: number;
  isOnTrack: boolean;
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
  currentStreak: number;
  isNewStreakDay: boolean;
};
