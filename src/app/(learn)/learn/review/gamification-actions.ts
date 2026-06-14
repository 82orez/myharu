"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { fetchUserStats, fetchDailyProgress, recordPractice } from "@/lib/gamification";
import type { UserStats, QuizMode } from "@/types/gamification";

export async function getUserStats(): Promise<{ stats?: UserStats; error?: string }> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "로그인이 필요합니다." };

  const stats = await fetchUserStats(supabase, user.id);
  if (!stats) return { error: "사용자 통계를 불러올 수 없습니다." };

  return { stats };
}

export async function getDailyProgress(): Promise<{ completed: number; goal: number; percentage: number; error?: string }> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { completed: 0, goal: 5, percentage: 0, error: "로그인이 필요합니다." };

  return await fetchDailyProgress(supabase, user.id);
}

export async function recordPracticeResult(
  sentenceId: string,
  isCorrect: boolean,
  mode: QuizMode = "speech",
): Promise<{ xpEarned: number; totalXp: number; error?: string }> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { xpEarned: 0, totalXp: 0, error: "로그인이 필요합니다." };

  return await recordPractice(supabase, user.id, sentenceId, isCorrect, mode);
}

// 점수와 무관하게 모드별 학습 횟수만 증가(퀴즈 전용 — 퀴즈는 practice_results를 기록하지 않음)
export async function incrementPracticeCount(sentenceId: string, mode: QuizMode): Promise<{ error?: string }> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "로그인이 필요합니다." };

  await supabase.rpc("increment_practice_count", { p_sentence_id: sentenceId, p_mode: mode });
  return {};
}
