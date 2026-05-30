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

// 태그 이름 변경: 프리셋 + 해당 태그를 가진 모든 문장의 tags에 일괄 반영
export async function renameTag(oldName: string, newName: string): Promise<{ presets?: string[]; newName?: string; error?: string }> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "로그인이 필요합니다." };

  const clean = sanitizeTags([newName])[0];
  if (!clean) return { error: "태그 이름을 입력해 주세요." };
  if (clean === oldName) return { newName: clean }; // 변화 없음

  // 1) 프리셋 갱신
  const { data: statsRow } = await supabase.from("user_stats").select("tag_presets").eq("user_id", user.id).single();
  const current = (statsRow?.tag_presets ?? []) as string[];
  const presets = sanitizeTags(
    current.map((t) => (t === oldName ? clean : t)),
    MAX_PRESETS,
  );

  const { error: presetErr } = await supabase.from("user_stats").update({ tag_presets: presets }).eq("user_id", user.id);
  if (presetErr) {
    console.error("[Supabase DB] 태그 이름 변경(프리셋) 실패:", presetErr);
    return { error: "태그 이름 변경 중 오류가 발생했습니다." };
  }

  // 2) 해당 태그를 가진 문장들의 tags 갱신
  const { data: rows } = await supabase.from("sentences").select("id, tags").eq("user_id", user.id).contains("tags", [oldName]);

  const updates = (rows ?? []).map((r: { id: string; tags: string[] }) => {
    const nextTags = sanitizeTags((r.tags ?? []).map((t) => (t === oldName ? clean : t)));
    return supabase.from("sentences").update({ tags: nextTags }).eq("id", r.id).eq("user_id", user.id);
  });

  const results = await Promise.all(updates);
  const failed = results.find((res) => res.error);
  if (failed?.error) {
    console.error("[Supabase DB] 태그 이름 변경(문장) 실패:", failed.error);
    return { error: "일부 문장의 태그 갱신에 실패했습니다." };
  }

  return { presets, newName: clean };
}
