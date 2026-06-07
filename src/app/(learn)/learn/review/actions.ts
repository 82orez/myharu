"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { sanitizeTags } from "@/lib/tags";

export type Sentence = {
  id: string;
  english_text: string;
  korean_text: string;
  audio_url: string;
  created_at: string;
  is_favorite: boolean;
  is_memorized: boolean;
  tags: string[];
  note: string;
};

export async function getSentences(): Promise<{ sentences?: Sentence[]; error?: string }> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "로그인이 필요합니다." };
  }

  const query = supabase
    .from("sentences")
    .select("id, english_text, korean_text, audio_path, created_at, is_favorite, tags, note")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const [sentenceRes, memorizedRes] = await Promise.all([
    query,
    supabase.from("practice_results").select("sentence_id").eq("user_id", user.id).eq("is_correct", true),
  ]);

  const { data, error } = sentenceRes;

  if (error) {
    console.error("[Supabase DB] 문장 조회 실패:", error);
    return { error: "문장 목록을 불러오는 중 오류가 발생했습니다." };
  }

  const memorizedIds = new Set((memorizedRes.data ?? []).map((r: { sentence_id: string }) => r.sentence_id));

  const sentences: Sentence[] = await Promise.all(
    (data ?? []).map(async (row) => {
      const { data: signedData } = await supabase.storage.from("tts-audio").createSignedUrl(row.audio_path, 3600);

      return {
        id: row.id,
        english_text: row.english_text,
        korean_text: row.korean_text,
        audio_url: signedData?.signedUrl ?? "",
        created_at: row.created_at,
        is_favorite: row.is_favorite,
        is_memorized: memorizedIds.has(row.id),
        tags: row.tags ?? [],
        note: row.note ?? "",
      };
    }),
  );

  return { sentences };
}

export async function toggleFavorite(id: string, isFavorite: boolean): Promise<{ error?: string }> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "로그인이 필요합니다." };
  }

  const { error } = await supabase.from("sentences").update({ is_favorite: isFavorite }).eq("id", id).eq("user_id", user.id);

  if (error) {
    console.error("[Supabase DB] 즐겨찾기 변경 실패:", error);
    return { error: "즐겨찾기 변경 중 오류가 발생했습니다." };
  }

  return {};
}

export type UpdateSentenceResult = { audioUrl: string } | { error: string };

export async function updateSentence(
  id: string,
  englishText: string,
  koreanText: string,
  newAudioBase64?: string,
  tags?: string[],
  note?: string,
): Promise<UpdateSentenceResult> {
  const english = englishText.trim();
  const korean = koreanText.trim();

  if (!english || !korean) {
    return { error: "영어 문장과 한국어 뜻을 모두 입력해 주세요." };
  }

  if (english.length > 500) {
    return { error: "영어 문장은 500자 이내로 입력해 주세요." };
  }

  if (korean.length > 500) {
    return { error: "한국어 뜻은 500자 이내로 입력해 주세요." };
  }

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "로그인이 필요합니다." };
  }

  const { data: existing } = await supabase.from("sentences").select("audio_path").eq("id", id).eq("user_id", user.id).single();

  if (!existing) {
    return { error: "문장을 찾을 수 없습니다." };
  }

  let audioPath = existing.audio_path;

  if (newAudioBase64) {
    const audioBuffer = Buffer.from(newAudioBase64, "base64");
    const fileId = crypto.randomUUID();
    const newPath = `${user.id}/${fileId}.mp3`;

    const { error: uploadError } = await supabase.storage.from("tts-audio").upload(newPath, audioBuffer, {
      contentType: "audio/mpeg",
      upsert: false,
    });

    if (uploadError) {
      console.error("[Supabase Storage] 업로드 실패:", uploadError);
      return { error: "음성 파일 저장 중 오류가 발생했습니다." };
    }

    await supabase.storage.from("tts-audio").remove([existing.audio_path]);
    audioPath = newPath;
  }

  const updatePayload: { english_text: string; korean_text: string; audio_path: string; tags?: string[]; note?: string } = {
    english_text: english,
    korean_text: korean,
    audio_path: audioPath,
  };
  if (tags !== undefined) updatePayload.tags = sanitizeTags(tags);
  if (note !== undefined) updatePayload.note = note.trim().slice(0, 1000);

  const { error: updateError } = await supabase.from("sentences").update(updatePayload).eq("id", id).eq("user_id", user.id);

  if (updateError) {
    console.error("[Supabase DB] 문장 수정 실패:", updateError);
    return { error: "문장 수정 중 오류가 발생했습니다." };
  }

  const { data: signedData } = await supabase.storage.from("tts-audio").createSignedUrl(audioPath, 3600);

  return { audioUrl: signedData?.signedUrl ?? "" };
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
