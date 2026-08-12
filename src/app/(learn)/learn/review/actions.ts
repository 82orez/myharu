"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { sanitizeTags } from "@/lib/tags";
import { sanitizeAudioStats, type AudioStats } from "@/lib/audio-loudness";
import { ALLOWED_AUDIO, ALLOWED_EXT, AUDIO_SIZE_ERROR, MAX_AUDIO_BYTES } from "@/lib/audio-formats";
import type { Tables } from "@/types/database.types";

// sentences Row에서 audio_path/user_id를 빼고, 서명 URL(audio_url)을 더한 앱 표현형
export type Sentence = Omit<Tables<"sentences">, "audio_path" | "user_id"> & {
  audio_url: string;
};

export async function getSentences(): Promise<{ sentences?: Sentence[]; error?: string }> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "로그인이 필요합니다." };
  }

  const { data, error } = await supabase
    .from("sentences")
    .select(
      "id, english_text, korean_text, audio_path, created_at, is_favorite, tags, note, speech_count, text_count, listen_count, loudness_db, peak_db",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

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
        is_favorite: row.is_favorite,
        tags: row.tags ?? [],
        note: row.note ?? "",
        speech_count: row.speech_count ?? 0,
        text_count: row.text_count ?? 0,
        listen_count: row.listen_count ?? 0,
        // 미측정(null)이면 재생 시 computeGain이 게인 1.0으로 처리한다
        loudness_db: row.loudness_db,
        peak_db: row.peak_db,
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

// 편집 폼에서 교체할 새 음성(AI 재생성 또는 업로드 파일). 없으면 기존 음성을 그대로 둔다.
export type NewAudioInput = { base64: string; mime: string; ext: string; stats: AudioStats | null };

export async function updateSentence(
  id: string,
  englishText: string,
  koreanText: string,
  tags?: string[],
  note?: string,
  newAudio?: NewAudioInput,
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

  // 음성 교체 요청이면 saveSentence와 동일한 기준으로 포맷을 검증한다
  if (newAudio && (!ALLOWED_AUDIO[newAudio.mime] || !ALLOWED_EXT.has(newAudio.ext))) {
    return { error: "지원하지 않는 오디오 형식입니다." };
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

  if (newAudio) {
    const audioBuffer = Buffer.from(newAudio.base64, "base64");

    if (audioBuffer.length > MAX_AUDIO_BYTES) {
      return { error: AUDIO_SIZE_ERROR };
    }

    const fileId = crypto.randomUUID();
    const newPath = `${user.id}/${fileId}.${newAudio.ext}`;

    const { error: uploadError } = await supabase.storage.from("tts-audio").upload(newPath, audioBuffer, {
      contentType: newAudio.mime,
      upsert: false,
    });

    if (uploadError) {
      console.error("[Supabase Storage] 업로드 실패:", uploadError);
      return { error: "음성 파일 저장 중 오류가 발생했습니다." };
    }

    await supabase.storage.from("tts-audio").remove([existing.audio_path]);
    audioPath = newPath;
  }

  const updatePayload: {
    english_text: string;
    korean_text: string;
    audio_path: string;
    tags?: string[];
    note?: string;
    loudness_db?: number | null;
    peak_db?: number | null;
  } = {
    english_text: english,
    korean_text: korean,
    audio_path: audioPath,
  };
  if (tags !== undefined) updatePayload.tags = sanitizeTags(tags);
  if (note !== undefined) updatePayload.note = note.trim().slice(0, 1000);

  // 오디오를 교체한 경우에만 측정값을 갱신한다. 텍스트/태그/메모만 고친 편집은 기존 측정값을 유지.
  if (newAudio) {
    const stats = sanitizeAudioStats(newAudio.stats);
    updatePayload.loudness_db = stats?.loudnessDb ?? null;
    updatePayload.peak_db = stats?.peakDb ?? null;
  }

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
