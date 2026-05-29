"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { sanitizeTags, MAX_PRESETS } from "@/lib/tags";

// 사용자별 태그 프리셋 목록 조회
export async function getTagPresets(): Promise<string[]> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase.from("user_stats").select("tag_presets").eq("user_id", user.id).single();
  return (data?.tag_presets ?? []) as string[];
}

// 프리셋 목록 전체 교체(추가/삭제 공용). 정규화된 목록 반환.
export async function setTagPresets(list: string[]): Promise<{ presets?: string[]; error?: string }> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "로그인이 필요합니다." };

  const presets = sanitizeTags(list, MAX_PRESETS);

  const { error } = await supabase.from("user_stats").update({ tag_presets: presets }).eq("user_id", user.id);

  if (error) {
    console.error("[Supabase DB] 태그 프리셋 저장 실패:", error);
    return { error: "태그 프리셋 저장 중 오류가 발생했습니다." };
  }

  return { presets };
}
