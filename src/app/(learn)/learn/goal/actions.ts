"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { MAX_DAILY_GOAL, MAX_PERSONAL_MESSAGE } from "@/lib/goal-config";

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

export async function setPersonalMessage(message: string): Promise<GoalActionResult> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "로그인이 필요합니다." };

  const trimmed = (message ?? "").trim();
  if (trimmed.length > MAX_PERSONAL_MESSAGE) {
    return { error: `한 마디는 ${MAX_PERSONAL_MESSAGE}자 이내로 입력해 주세요.` };
  }

  const { error } = await supabase.from("user_stats").update({ personal_message: trimmed }).eq("user_id", user.id);

  if (error) {
    console.error("[setPersonalMessage] 업데이트 실패:", error);
    return { error: "저장 중 오류가 발생했습니다." };
  }

  revalidatePath("/");
  revalidatePath("/learn/goal");
  return { success: true };
}
