"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { todayKST } from "@/lib/gamification";

export type GoalActionResult = { success: true } | { error: string };

export async function setLearningGoal(totalGoal: number, periodDays: number): Promise<GoalActionResult> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "로그인이 필요합니다." };

  if (!Number.isInteger(totalGoal) || totalGoal < 1 || totalGoal > 10000) {
    return { error: "총 목표 문장 수는 1~10,000 사이여야 합니다." };
  }
  if (!Number.isInteger(periodDays) || periodDays < 1 || periodDays > 365) {
    return { error: "기간은 1~365일 사이여야 합니다." };
  }

  const dailyGoal = Math.ceil(totalGoal / periodDays);

  const { error } = await supabase
    .from("user_stats")
    .update({
      total_goal: totalGoal,
      goal_period_days: periodDays,
      goal_start_date: todayKST(),
      daily_goal: dailyGoal,
    })
    .eq("user_id", user.id);

  if (error) {
    console.error("[setLearningGoal] 업데이트 실패:", error);
    return { error: "목표 저장 중 오류가 발생했습니다." };
  }

  revalidatePath("/");
  revalidatePath("/learn/goal");
  return { success: true };
}

export async function resetLearningGoal(): Promise<GoalActionResult> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "로그인이 필요합니다." };

  const { error } = await supabase
    .from("user_stats")
    .update({
      total_goal: null,
      goal_period_days: null,
      goal_start_date: null,
      daily_goal: 5,
    })
    .eq("user_id", user.id);

  if (error) {
    console.error("[resetLearningGoal] 업데이트 실패:", error);
    return { error: "목표 초기화 중 오류가 발생했습니다." };
  }

  revalidatePath("/");
  revalidatePath("/learn/goal");
  return { success: true };
}
