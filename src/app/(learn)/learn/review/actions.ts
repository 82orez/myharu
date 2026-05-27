"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export type Sentence = {
  id: string;
  english_text: string;
  korean_text: string;
  audio_url: string;
  created_at: string;
};

export async function getSentences(dateFilter?: string): Promise<{ sentences?: Sentence[]; error?: string }> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "로그인이 필요합니다." };
  }

  let query = supabase.from("sentences").select("id, english_text, korean_text, audio_path, created_at").eq("user_id", user.id);

  if (dateFilter) {
    const start = `${dateFilter}T00:00:00+09:00`;
    const nextDay = new Date(start);
    nextDay.setDate(nextDay.getDate() + 1);
    query = query.gte("created_at", start).lt("created_at", nextDay.toISOString());
  }

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error("[Supabase DB] 문장 조회 실패:", error);
    return { error: "문장 목록을 불러오는 중 오류가 발생했습니다." };
  }

  const sentences: Sentence[] = await Promise.all(
    (data ?? []).map(async (row) => {
      const { data: signedData } = await supabase.storage.from("tts-audio").createSignedUrl(row.audio_path, 3600);

      return {
        id: row.id,
        english_text: row.english_text,
        korean_text: row.korean_text,
        audio_url: signedData?.signedUrl ?? "",
        created_at: row.created_at,
      };
    }),
  );

  return { sentences };
}

export async function deleteSentence(id: string): Promise<{ error?: string }> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "로그인이 필요합니다." };
  }

  const { data: sentence } = await supabase.from("sentences").select("audio_path").eq("id", id).eq("user_id", user.id).single();

  if (!sentence) {
    return { error: "문장을 찾을 수 없습니다." };
  }

  const { error: deleteError } = await supabase.from("sentences").delete().eq("id", id).eq("user_id", user.id);

  if (deleteError) {
    console.error("[Supabase DB] 문장 삭제 실패:", deleteError);
    return { error: "문장 삭제 중 오류가 발생했습니다." };
  }

  await supabase.storage.from("tts-audio").remove([sentence.audio_path]);

  return {};
}
