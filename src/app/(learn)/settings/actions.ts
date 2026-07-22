"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { MAX_PERSONAL_MESSAGE } from "@/lib/settings-config";

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
