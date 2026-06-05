"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getOpenAIClient } from "@/lib/openai";
import { sanitizeTags } from "@/lib/tags";
import { DEFAULT_VOICE, isValidVoice } from "@/lib/tts-voices";

export type GenerateAudioResult = { audioBase64: string } | { error: string };
export type SaveSentenceResult = { success: string } | { error: string };

export async function generateAudio(englishText: string, voice?: string): Promise<GenerateAudioResult> {
  const text = englishText.trim();
  const safeVoice = isValidVoice(voice) ? voice : DEFAULT_VOICE;

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
      voice: safeVoice,
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

// 업로드 허용 오디오 포맷 화이트리스트 (mime → 확장자)
const ALLOWED_AUDIO: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
};
const ALLOWED_EXT = new Set(["mp3", "wav", "m4a", "aac", "ogg", "webm"]);
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB

export async function saveSentence(
  englishText: string,
  koreanText: string,
  audioBase64: string,
  tags: string[] = [],
  audioMime: string = "audio/mpeg",
  audioExt: string = "mp3",
): Promise<SaveSentenceResult> {
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
    return { error: "음성 데이터가 없습니다. 음성을 먼저 생성하거나 파일을 업로드해 주세요." };
  }

  if (!ALLOWED_AUDIO[audioMime] || !ALLOWED_EXT.has(audioExt)) {
    return { error: "지원하지 않는 오디오 형식입니다." };
  }

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "로그인이 필요합니다." };
  }

  const audioBuffer = Buffer.from(audioBase64, "base64");

  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    return { error: "파일 크기는 10MB 이하여야 합니다." };
  }

  const fileId = crypto.randomUUID();
  const storagePath = `${user.id}/${fileId}.${audioExt}`;

  const { error: uploadError } = await supabase.storage.from("tts-audio").upload(storagePath, audioBuffer, {
    contentType: audioMime,
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
