"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getOpenAIClient } from "@/lib/openai";
import { sanitizeTags } from "@/lib/tags";

export type GenerateAudioResult = { audioBase64: string } | { error: string };
export type SaveSentenceResult = { success: string } | { error: string };

export async function generateAudio(englishText: string): Promise<GenerateAudioResult> {
  const text = englishText.trim();

  if (!text) {
    return { error: "영어 문장을 입력해 주세요." };
  }

  if (text.length > 500) {
    return { error: "영어 문장은 500자 이내로 입력해 주세요." };
  }

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "로그인이 필요합니다." };
  }

  try {
    const openai = getOpenAIClient();
    const mp3Response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: text,
      response_format: "mp3",
    });
    const arrayBuffer = await mp3Response.arrayBuffer();
    const audioBase64 = Buffer.from(arrayBuffer).toString("base64");
    return { audioBase64 };
  } catch (err) {
    console.error("[OpenAI TTS] 음성 생성 실패:", err);
    return { error: "음성 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  }
}

export async function saveSentence(englishText: string, koreanText: string, audioBase64: string, tags: string[] = []): Promise<SaveSentenceResult> {
  const english = englishText.trim();
  const korean = koreanText.trim();
  const cleanTags = sanitizeTags(tags);

  if (!english || !korean) {
    return { error: "영어 문장과 한국어 뜻을 모두 입력해 주세요." };
  }

  if (english.length > 500) {
    return { error: "영어 문장은 500자 이내로 입력해 주세요." };
  }

  if (korean.length > 500) {
    return { error: "한국어 뜻은 500자 이내로 입력해 주세요." };
  }

  if (!audioBase64) {
    return { error: "음성 데이터가 없습니다. 음성을 먼저 생성해 주세요." };
  }

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "로그인이 필요합니다." };
  }

  const audioBuffer = Buffer.from(audioBase64, "base64");
  const fileId = crypto.randomUUID();
  const storagePath = `${user.id}/${fileId}.mp3`;

  const { error: uploadError } = await supabase.storage.from("tts-audio").upload(storagePath, audioBuffer, {
    contentType: "audio/mpeg",
    upsert: false,
  });

  if (uploadError) {
    console.error("[Supabase Storage] 업로드 실패:", uploadError);
    return { error: "음성 파일 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  }

  const { error: insertError } = await supabase.from("sentences").insert({
    user_id: user.id,
    english_text: english,
    korean_text: korean,
    audio_path: storagePath,
    tags: cleanTags,
  });

  if (insertError) {
    console.error("[Supabase DB] 문장 저장 실패:", insertError);
    await supabase.storage.from("tts-audio").remove([storagePath]);
    return { error: "문장 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  }

  return { success: "문장이 저장되었습니다!" };
}

// 입력 폼 자동완성용: 사용자가 이전에 사용한 태그를 distinct 정렬해 반환
export async function getUserTags(): Promise<string[]> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase.from("sentences").select("tags").eq("user_id", user.id);

  const set = new Set<string>();
  for (const row of data ?? []) {
    for (const tag of (row.tags ?? []) as string[]) set.add(tag);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
}
