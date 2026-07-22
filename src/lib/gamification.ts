import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { UserStats, QuizMode } from "@/types/gamification";
import { DAILY_PRACTICE_GOAL } from "@/lib/goal-config";

type DbClient = SupabaseClient<Database>;

export function todayKST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

export async function fetchUserStats(supabase: DbClient, userId: string): Promise<UserStats | null> {
  const { data } = await supabase.from("user_stats").select("*").eq("user_id", userId).single();

  if (data) return data;

  await supabase.from("user_stats").upsert({ user_id: userId });
  const { data: retry } = await supabase.from("user_stats").select("*").eq("user_id", userId).single();
  return retry ?? null;
}

// 오늘(KST) 정답 연습 횟수 / 고정 목표(DAILY_PRACTICE_GOAL). 문장 목록·퀴즈 정답 모두 practice_results에 기록되므로 함께 집계된다.
export async function fetchDailyProgress(supabase: DbClient, userId: string): Promise<{ completed: number; goal: number; percentage: number }> {
  const today = todayKST();
  const start = `${today}T00:00:00+09:00`;
  const nextDay = new Date(start);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayIso = nextDay.toISOString();

  const { count } = await supabase
    .from("practice_results")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_correct", true)
    .gte("practiced_at", start)
    .lt("practiced_at", nextDayIso);

  const completed = count ?? 0;
  const goal = DAILY_PRACTICE_GOAL;

  return { completed, goal, percentage: goal > 0 ? Math.min(Math.round((completed / goal) * 100), 100) : 0 };
}

export async function recordPractice(
  supabase: DbClient,
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

  // 모드별 정답 횟수 카운터 증가(정답일 때만, 점수와 무관, 퀴즈와 공유)
  if (isCorrect) {
    await supabase.rpc("increment_practice_count", { p_sentence_id: sentenceId, p_mode: mode });
  }

  const stats = await fetchUserStats(supabase, userId);
  if (!stats) {
    return { xpEarned, totalXp: xpEarned };
  }

  const newTotalXp = stats.total_xp + xpEarned;

  await supabase.from("user_stats").update({ total_xp: newTotalXp }).eq("user_id", userId);

  return { xpEarned, totalXp: newTotalXp };
}

export async function fetchMemorizedCount(supabase: DbClient, userId: string): Promise<number> {
  const { data } = await supabase.from("practice_results").select("sentence_id").eq("user_id", userId).eq("is_correct", true);

  if (!data) return 0;
  const unique = new Set(data.map((row) => row.sentence_id));
  return unique.size;
}

/** 모든 문장의 정답 횟수(스피킹 + 쓰기) 합계 */
export async function fetchPracticeCountTotal(supabase: DbClient, userId: string): Promise<number> {
  const { data } = await supabase.from("sentences").select("speech_count, text_count").eq("user_id", userId);

  if (!data) return 0;
  return data.reduce((sum, row) => sum + (row.speech_count ?? 0) + (row.text_count ?? 0), 0);
}

/** 날짜(KST YYYY-MM-DD)별 정답 연습 횟수. 학습 달력 히트맵용. */
export async function fetchDailyPracticeCount(supabase: DbClient, userId: string): Promise<Record<string, number>> {
  const { data } = await supabase.from("practice_results").select("practiced_at").eq("user_id", userId).eq("is_correct", true);

  if (!data) return {};

  const counts: Record<string, number> = {};
  for (const row of data) {
    const kstDate = new Date(row.practiced_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    counts[kstDate] = (counts[kstDate] ?? 0) + 1;
  }
  return counts;
}

export async function fetchDailyMemorized(supabase: DbClient, userId: string): Promise<Record<string, number>> {
  const { data } = await supabase.from("practice_results").select("sentence_id, practiced_at").eq("user_id", userId).eq("is_correct", true);

  if (!data) return {};

  // 문장별 최초 정답 KST 날짜(YYYY-MM-DD) 산출
  const firstDate = new Map<string, string>();
  for (const row of data) {
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
