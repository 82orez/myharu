import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserStats, GoalProgress, QuizMode } from "@/types/gamification";

export function todayKST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
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
): Promise<{ xpEarned: number; totalXp: number }> {
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
    return { xpEarned, totalXp: xpEarned };
  }

  const newTotalXp = stats.total_xp + xpEarned;

  await supabase.from("user_stats").update({ total_xp: newTotalXp }).eq("user_id", userId);

  return { xpEarned, totalXp: newTotalXp };
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

  // 문장별 최초 정답 KST 날짜 산출. 쿼리는 전체를 가져온다(시작일 이전 최초 암기 후 재연습한 문장을
  // 잘못 포함하지 않도록, 시작일 필터는 firstDate 기준으로 아래에서 적용).
  const { data } = await supabase.from("practice_results").select("sentence_id, practiced_at").eq("user_id", userId).eq("is_correct", true);
  const firstDate = new Map<string, string>();
  for (const row of (data ?? []) as { sentence_id: string; practiced_at: string }[]) {
    const d = new Date(row.practiced_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    const prev = firstDate.get(row.sentence_id);
    if (!prev || d < prev) firstDate.set(row.sentence_id, d);
  }
  // 목표 시작일(goal_start_date) 이전에 암기한 문장은 목표 진척에서 제외 (시작일 당일 암기분은 포함)
  let memorized = 0;
  let memorizedBeforeToday = 0;
  firstDate.forEach((d) => {
    if (d < startDate) return;
    memorized++;
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
