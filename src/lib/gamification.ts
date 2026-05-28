import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserStats, GoalProgress } from "@/types/gamification";

export function todayKST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

function yesterdayKST(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

function diffDays(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00+09:00`).getTime();
  const to = new Date(`${toISO}T00:00:00+09:00`).getTime();
  return Math.round((to - from) / 86_400_000);
}

export async function fetchUserStats(supabase: SupabaseClient, userId: string): Promise<UserStats | null> {
  const { data } = await supabase.from("user_stats").select("*").eq("user_id", userId).single();

  if (data) return data as UserStats;

  await supabase.from("user_stats").upsert({ user_id: userId });
  const { data: retry } = await supabase.from("user_stats").select("*").eq("user_id", userId).single();
  return (retry as UserStats) ?? null;
}

export async function fetchDailyProgress(supabase: SupabaseClient, userId: string): Promise<{ completed: number; goal: number; percentage: number }> {
  const today = todayKST();
  const start = `${today}T00:00:00+09:00`;
  const nextDay = new Date(start);
  nextDay.setDate(nextDay.getDate() + 1);

  const { count } = await supabase
    .from("practice_results")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("practiced_at", start)
    .lt("practiced_at", nextDay.toISOString());

  const completed = count ?? 0;

  const stats = await fetchUserStats(supabase, userId);
  const goal = stats?.daily_goal ?? 5;

  return { completed, goal, percentage: goal > 0 ? Math.min(Math.round((completed / goal) * 100), 100) : 0 };
}

export async function recordPractice(
  supabase: SupabaseClient,
  userId: string,
  sentenceId: string,
  isCorrect: boolean,
): Promise<{ xpEarned: number; totalXp: number; currentStreak: number; dailyCompleted: number; isNewStreakDay: boolean }> {
  const xpEarned = isCorrect ? 10 : 2;

  await supabase.from("practice_results").insert({
    user_id: userId,
    sentence_id: sentenceId,
    is_correct: isCorrect,
    xp_earned: xpEarned,
  });

  const stats = await fetchUserStats(supabase, userId);
  if (!stats) {
    return { xpEarned, totalXp: xpEarned, currentStreak: 1, dailyCompleted: 1, isNewStreakDay: true };
  }

  const today = todayKST();
  const yesterday = yesterdayKST();
  let { current_streak, longest_streak } = stats;
  let isNewStreakDay = false;

  if (stats.last_practice_date !== today) {
    isNewStreakDay = true;
    if (stats.last_practice_date === yesterday) {
      current_streak += 1;
    } else {
      current_streak = 1;
    }
    if (current_streak > longest_streak) {
      longest_streak = current_streak;
    }
  }

  const newTotalXp = stats.total_xp + xpEarned;

  await supabase
    .from("user_stats")
    .update({
      total_xp: newTotalXp,
      current_streak,
      longest_streak,
      last_practice_date: today,
    })
    .eq("user_id", userId);

  const { completed } = await fetchDailyProgress(supabase, userId);

  return { xpEarned, totalXp: newTotalXp, currentStreak: current_streak, dailyCompleted: completed, isNewStreakDay };
}

export async function fetchMemorizedCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase.from("practice_results").select("sentence_id").eq("user_id", userId).eq("is_correct", true);

  if (!data) return 0;
  const unique = new Set(data.map((row: { sentence_id: string }) => row.sentence_id));
  return unique.size;
}

export async function fetchGoalProgress(supabase: SupabaseClient, userId: string): Promise<GoalProgress | null> {
  const stats = await fetchUserStats(supabase, userId);
  if (!stats?.total_goal || !stats.goal_period_days || !stats.goal_start_date) return null;

  const memorized = await fetchMemorizedCount(supabase, userId);
  const totalGoal = stats.total_goal;
  const periodDays = stats.goal_period_days;
  const startDate = stats.goal_start_date;

  const today = todayKST();
  const elapsed = Math.max(0, Math.min(periodDays, diffDays(startDate, today)));
  const remaining = Math.max(0, periodDays - elapsed);

  const left = Math.max(0, totalGoal - memorized);
  const dailyMinimum = left === 0 ? 0 : remaining === 0 ? left : Math.ceil(left / remaining);

  const percentage = totalGoal > 0 ? Math.min(Math.round((memorized / totalGoal) * 100), 100) : 0;
  const isOnTrack = memorized * periodDays >= totalGoal * elapsed;

  return {
    memorized,
    totalGoal,
    periodDays,
    startDate,
    daysElapsed: elapsed,
    daysRemaining: remaining,
    dailyMinimum,
    percentage,
    isOnTrack,
  };
}
