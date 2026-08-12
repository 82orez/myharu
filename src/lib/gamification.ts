import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { UserStats, QuizMode } from "@/types/gamification";
import { resolveDailyGoal } from "@/lib/settings-config";

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

// 오늘(KST) 정답 연습 횟수 / 사용자 목표(user_stats.daily_goal). 문장 목록·퀴즈 정답 모두 practice_results에 기록되므로 함께 집계된다.
// goalOverride를 주면 목표 조회를 건너뛴다(이미 user_stats를 읽은 호출자용). 없으면 카운트와 병렬로 조회해 왕복을 늘리지 않는다.
export async function fetchDailyProgress(
  supabase: DbClient,
  userId: string,
  goalOverride?: number | null,
): Promise<{ completed: number; goal: number; percentage: number }> {
  const today = todayKST();
  const start = `${today}T00:00:00+09:00`;
  const nextDay = new Date(start);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayIso = nextDay.toISOString();

  const [{ count }, goalRow] = await Promise.all([
    supabase
      .from("practice_results")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_correct", true)
      .gte("practiced_at", start)
      .lt("practiced_at", nextDayIso),
    goalOverride == null ? supabase.from("user_stats").select("daily_goal").eq("user_id", userId).maybeSingle() : Promise.resolve(null),
  ]);

  const completed = count ?? 0;
  const goal = resolveDailyGoal(goalOverride ?? goalRow?.data?.daily_goal);

  return { completed, goal, percentage: goal > 0 ? Math.min(Math.round((completed / goal) * 100), 100) : 0 };
}

// 연습 결과 기록(문장 목록 전용). 정답이면 문장별 카운터도 증가시킨다.
export async function recordPractice(
  supabase: DbClient,
  userId: string,
  sentenceId: string,
  isCorrect: boolean,
  mode: QuizMode = "speech",
): Promise<void> {
  await supabase.from("practice_results").insert({
    user_id: userId,
    sentence_id: sentenceId,
    is_correct: isCorrect,
    mode,
  });

  if (isCorrect) {
    await supabase.rpc("increment_practice_count", { p_sentence_id: sentenceId, p_mode: mode });
  }
}

/** 모든 문장의 연습 횟수(스피킹·쓰기 정답 + 듣기 재생) 합계 */
export async function fetchPracticeCountTotal(supabase: DbClient, userId: string): Promise<number> {
  const { data } = await supabase.from("sentences").select("speech_count, text_count, listen_count").eq("user_id", userId);

  if (!data) return 0;
  return data.reduce((sum, row) => sum + (row.speech_count ?? 0) + (row.text_count ?? 0) + (row.listen_count ?? 0), 0);
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
