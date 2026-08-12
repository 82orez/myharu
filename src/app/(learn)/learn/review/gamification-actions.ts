"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { fetchUserStats, recordPractice } from "@/lib/gamification";
import type { UserStats, QuizMode, PracticeMode } from "@/types/gamification";

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

export async function recordPracticeResult(sentenceId: string, isCorrect: boolean, mode: QuizMode = "speech"): Promise<{ error?: string }> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "로그인이 필요합니다." };

  await recordPractice(supabase, user.id, sentenceId, isCorrect, mode);
  return {};
}

// 퀴즈 정답 + 문장 목록의 듣기 재생용. 오늘의 목표·학습 달력 집계에 포함되도록 practice_results에 기록을 남기고,
// 문장별 모드 카운터(speech/text/listen)도 함께 증가시킨다.
export async function incrementPracticeCount(sentenceId: string, mode: PracticeMode): Promise<{ error?: string }> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "로그인이 필요합니다." };

  await Promise.all([
    supabase.from("practice_results").insert({
      user_id: user.id,
      sentence_id: sentenceId,
      is_correct: true,
      mode,
    }),
    supabase.rpc("increment_practice_count", { p_sentence_id: sentenceId, p_mode: mode }),
  ]);
  return {};
}
