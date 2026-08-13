"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { MAX_DAILY_GOAL, MAX_PERSONAL_MESSAGE, MIN_DAILY_GOAL } from "@/lib/settings-config";

export type SettingsActionResult = { success: true } | { error: string };

export async function setSpeechStrict(strict: boolean): Promise<SettingsActionResult> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "로그인이 필요합니다." };

  const { error } = await supabase.from("user_stats").update({ speech_strict: strict }).eq("user_id", user.id);

  if (error) {
    console.error("[setSpeechStrict] 업데이트 실패:", error);
    return { error: "저장 중 오류가 발생했습니다." };
  }

  revalidatePath("/");
  revalidatePath("/settings");
  return { success: true };
}

// 하루 목표 연습 횟수. 범위 밖은 clamp 대신 거부한다(오타를 사용자가 알아채야 한다).
export async function setDailyGoal(goal: number): Promise<SettingsActionResult> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "로그인이 필요합니다." };

  if (!Number.isInteger(goal) || goal < MIN_DAILY_GOAL || goal > MAX_DAILY_GOAL) {
    return { error: `하루 목표는 ${MIN_DAILY_GOAL}~${MAX_DAILY_GOAL.toLocaleString()} 사이의 정수로 입력해 주세요.` };
  }

  const { error } = await supabase.from("user_stats").update({ daily_goal: goal }).eq("user_id", user.id);

  if (error) {
    console.error("[setDailyGoal] 업데이트 실패:", error);
    return { error: "저장 중 오류가 발생했습니다." };
  }

  revalidatePath("/");
  revalidatePath("/settings");
  return { success: true };
}

export async function setPersonalMessage(message: string): Promise<SettingsActionResult> {
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
  revalidatePath("/settings");
  return { success: true };
}

// 문장별 연습 횟수 카운터만 0으로. ⚠️ 문장·음성·practice_results는 건드리지 않는다(달력·오늘 진도 유지).
export async function resetPracticeCounts(): Promise<SettingsActionResult> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "로그인이 필요합니다." };

  const { error } = await supabase.from("sentences").update({ speech_count: 0, text_count: 0, listen_count: 0 }).eq("user_id", user.id);

  if (error) {
    console.error("[resetPracticeCounts] 초기화 실패:", error);
    return { error: "연습 횟수를 초기화하는 중 오류가 발생했습니다." };
  }

  revalidatePath("/");
  revalidatePath("/learn/review");
  revalidatePath("/settings");
  return { success: true };
}

// 연습 기록(practice_results) 전체 삭제 → 오늘의 목표 진도·학습 달력 초기화.
// ⚠️ 문장별 카운터(speech/text/listen_count)는 그대로 남는다.
export async function resetPracticeHistory(): Promise<{ deleted?: number; error?: string }> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "로그인이 필요합니다." };

  // 토스트에 쓸 건수는 삭제 전에 센다(delete는 삭제된 행 수를 돌려주지 않는다)
  const { count } = await supabase.from("practice_results").select("*", { count: "exact", head: true }).eq("user_id", user.id);

  const { error } = await supabase.from("practice_results").delete().eq("user_id", user.id);

  if (error) {
    console.error("[resetPracticeHistory] 삭제 실패:", error);
    return { error: "학습 기록을 초기화하는 중 오류가 발생했습니다." };
  }

  revalidatePath("/");
  revalidatePath("/learn/review");
  revalidatePath("/settings");
  return { deleted: count ?? 0 };
}

// 등록된 모든 문장 삭제. practice_results가 FK cascade라 연습 기록도 함께 사라진다.
export async function deleteAllSentences(): Promise<{ deleted?: number; error?: string }> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "로그인이 필요합니다." };

  const { data: rows, error: selectError } = await supabase.from("sentences").select("audio_path").eq("user_id", user.id);

  if (selectError) {
    console.error("[deleteAllSentences] 조회 실패:", selectError);
    return { error: "문장을 불러오는 중 오류가 발생했습니다." };
  }

  if (!rows || rows.length === 0) return { deleted: 0 };

  const { error: deleteError } = await supabase.from("sentences").delete().eq("user_id", user.id);

  if (deleteError) {
    console.error("[deleteAllSentences] 삭제 실패:", deleteError);
    return { error: "문장 삭제 중 오류가 발생했습니다." };
  }

  // Storage 정리(실패해도 DB 삭제는 이미 완료 — 로그만 남긴다)
  const paths = rows.map((r) => r.audio_path).filter(Boolean);
  for (let i = 0; i < paths.length; i += 100) {
    const { error: storageError } = await supabase.storage.from("tts-audio").remove(paths.slice(i, i + 100));
    if (storageError) console.error("[deleteAllSentences] 음성 파일 삭제 실패:", storageError);
  }

  revalidatePath("/");
  revalidatePath("/learn/review");
  revalidatePath("/settings");
  return { deleted: rows.length };
}
