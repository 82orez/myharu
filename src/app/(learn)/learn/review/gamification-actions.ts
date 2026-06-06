"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { fetchUserStats, fetchDailyProgress, fetchGoalProgress, recordPractice } from "@/lib/gamification";
import type { UserStats, GoalProgress, QuizMode } from "@/types/gamification";

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

export async function getGoalProgress(): Promise<{ goal: GoalProgress | null; error?: string }> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { goal: null, error: "로그인이 필요합니다." };

  const goal = await fetchGoalProgress(supabase, user.id);
  return { goal };
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
