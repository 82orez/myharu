"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { MAX_DAILY_GOAL } from "@/lib/goal-config";

export type GoalActionResult = { success: true } | { error: string };

export async function setDailyGoal(dailyGoal: number): Promise<GoalActionResult> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "로그인이 필요합니다." };

  if (!Number.isInteger(dailyGoal) || dailyGoal < 1 || dailyGoal > MAX_DAILY_GOAL) {
    return { error: `하루 목표는 1~${MAX_DAILY_GOAL}문장 사이여야 합니다.` };
  }

  const { error } = await supabase.from("user_stats").update({ daily_goal: dailyGoal }).eq("user_id", user.id);

  if (error) {
    console.error("[setDailyGoal] 업데이트 실패:", error);
    return { error: "목표 저장 중 오류가 발생했습니다." };
  }

  revalidatePath("/");
  revalidatePath("/learn/goal");
  return { success: true };
}
