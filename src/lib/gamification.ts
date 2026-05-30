import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserStats, GoalProgress, QuizMode } from "@/types/gamification";

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

// 읽기 시점 스트릭 보정: last_practice_date(= 마지막 일일 목표 달성일)가 오늘도 어제도 아니면 이미 끊긴 것으로 보고 0 반환.
// current_streak은 recordPractice가 돌 때만 갱신되므로, 공백 기간 동안 옛 값이 남는 문제를 표시 단계에서 보정한다.
// (오늘이 last_practice_date면 오늘 목표 달성 완료, 어제면 오늘 목표를 채울 때까지 유지 상태로 본다.)
export function effectiveStreak(stats: Pick<UserStats, "current_streak" | "last_practice_date"> | null): number {
  if (!stats?.last_practice_date) return 0;
  const today = todayKST();
  const yesterday = yesterdayKST();
  if (stats.last_practice_date === today || stats.last_practice_date === yesterday) {
    return stats.current_streak;
  }
  return 0;
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
  const nextDayIso = nextDay.toISOString();

  const [todayRes, priorRes, stats] = await Promise.all([
    supabase
      .from("practice_results")
      .select("sentence_id")
      .eq("user_id", userId)
      .eq("is_correct", true)
      .gte("practiced_at", start)
      .lt("practiced_at", nextDayIso),
    supabase
      .from("practice_results")
      .select("sentence_id")
      .eq("user_id", userId)
      .eq("is_correct", true)
      .lt("practiced_at", start),
    fetchUserStats(supabase, userId),
  ]);

  const todayIds = new Set((todayRes.data ?? []).map((r: { sentence_id: string }) => r.sentence_id));
  const priorIds = new Set((priorRes.data ?? []).map((r: { sentence_id: string }) => r.sentence_id));

  let completed = 0;
  todayIds.forEach((id) => {
    if (!priorIds.has(id)) completed++;
  });

  const goal = stats?.daily_goal ?? 5;

  return { completed, goal, percentage: goal > 0 ? Math.min(Math.round((completed / goal) * 100), 100) : 0 };
}

export async function recordPractice(
  supabase: SupabaseClient,
  userId: string,
  sentenceId: string,
  isCorrect: boolean,
  mode: QuizMode = "speech",
): Promise<{ xpEarned: number; totalXp: number; currentStreak: number; dailyCompleted: number; isNewStreakDay: boolean }> {
  const xpEarned = isCorrect ? 10 : 2;

  await supabase.from("practice_results").insert({
    user_id: userId,
    sentence_id: sentenceId,
    is_correct: isCorrect,
    xp_earned: xpEarned,
    mode,
  });

  const stats = await fetchUserStats(supabase, userId);
  if (!stats) {
    return { xpEarned, totalXp: xpEarned, currentStreak: 0, dailyCompleted: isCorrect ? 1 : 0, isNewStreakDay: false };
  }

  const newTotalXp = stats.total_xp + xpEarned;

  // 오늘 신규 암기 수와 "오늘의 일일 목표"(홈 표시와 동일: 장기 목표가 있으면 동적 dailyMinimum, 없으면 daily_goal)
  const { completed } = await fetchDailyProgress(supabase, userId);
  const goalProgress = await fetchGoalProgress(supabase, userId);
  const dailyGoal = goalProgress?.dailyMinimum && goalProgress.dailyMinimum > 0 ? goalProgress.dailyMinimum : (stats.daily_goal ?? 5);
  // 스트릭은 "일일 목표를 달성한 날"만 카운트. 장기 목표를 이미 모두 채운 경우(dailyMinimum===0)는 학습만 해도 유지.
  const goalMet = goalProgress && goalProgress.dailyMinimum === 0 ? completed > 0 : completed >= dailyGoal;

  const today = todayKST();
  const yesterday = yesterdayKST();
  let { current_streak, longest_streak } = stats;
  let isNewStreakDay = false;

  // last_practice_date = 마지막으로 일일 목표를 달성한 날. 하루 한 번만 반영.
  if (goalMet && stats.last_practice_date !== today) {
    isNewStreakDay = true;
    current_streak = stats.last_practice_date === yesterday ? current_streak + 1 : 1;
    if (current_streak > longest_streak) {
      longest_streak = current_streak;
    }
  }

  await supabase
    .from("user_stats")
    .update({
      total_xp: newTotalXp,
      current_streak,
      longest_streak,
      // 목표를 달성해 새로 카운트한 날만 갱신 (미달이면 직전 달성일 유지 → 그날 안에 목표를 채우면 스트릭 유지)
      ...(isNewStreakDay ? { last_practice_date: today } : {}),
    })
    .eq("user_id", userId);

  return { xpEarned, totalXp: newTotalXp, currentStreak: current_streak, dailyCompleted: completed, isNewStreakDay };
}

export async function fetchMemorizedCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase.from("practice_results").select("sentence_id").eq("user_id", userId).eq("is_correct", true);

  if (!data) return 0;
  const unique = new Set(data.map((row: { sentence_id: string }) => row.sentence_id));
  return unique.size;
}

export async function fetchDailyMemorized(supabase: SupabaseClient, userId: string): Promise<Record<string, number>> {
  const { data } = await supabase.from("practice_results").select("sentence_id, practiced_at").eq("user_id", userId).eq("is_correct", true);

  if (!data) return {};

  // 문장별 최초 정답 KST 날짜(YYYY-MM-DD) 산출
  const firstDate = new Map<string, string>();
  for (const row of data as { sentence_id: string; practiced_at: string }[]) {
    const kstDate = new Date(row.practiced_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    const prev = firstDate.get(row.sentence_id);
    if (!prev || kstDate < prev) firstDate.set(row.sentence_id, kstDate);
  }

  // 최초 암기 날짜별 신규 암기 문장 수
  const counts: Record<string, number> = {};
  firstDate.forEach((date) => {
    counts[date] = (counts[date] ?? 0) + 1;
  });
  return counts;
}

export async function fetchGoalProgress(supabase: SupabaseClient, userId: string): Promise<GoalProgress | null> {
  const stats = await fetchUserStats(supabase, userId);
  if (!stats?.total_goal || !stats.goal_period_days || !stats.goal_start_date) return null;

  const totalGoal = stats.total_goal;
  const periodDays = stats.goal_period_days;
  const startDate = stats.goal_start_date;
  const today = todayKST();

  // 문장별 최초 정답 KST 날짜 → 전체 누적(memorized) / 오늘 이전 누적(memorizedBeforeToday) 동시 산출
  const { data } = await supabase.from("practice_results").select("sentence_id, practiced_at").eq("user_id", userId).eq("is_correct", true);
  const firstDate = new Map<string, string>();
  for (const row of (data ?? []) as { sentence_id: string; practiced_at: string }[]) {
    const d = new Date(row.practiced_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    const prev = firstDate.get(row.sentence_id);
    if (!prev || d < prev) firstDate.set(row.sentence_id, d);
  }
  const memorized = firstDate.size;
  let memorizedBeforeToday = 0;
  firstDate.forEach((d) => {
    if (d < today) memorizedBeforeToday++;
  });

  const elapsed = Math.max(0, Math.min(periodDays, diffDays(startDate, today)));
  const remaining = Math.max(0, periodDays - elapsed);

  // 오늘 최소 목표: 오늘 시작 시점의 미암기 수 기준 → 당일 진척이 분모를 깎지 않음(하루 동안 고정, 다음 날 재계산)
  const leftBeforeToday = Math.max(0, totalGoal - memorizedBeforeToday);
  const dailyMinimum = leftBeforeToday === 0 ? 0 : remaining === 0 ? leftBeforeToday : Math.ceil(leftBeforeToday / remaining);

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
