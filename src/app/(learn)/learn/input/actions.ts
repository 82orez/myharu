"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getOpenAIClient } from "@/lib/openai";
import { sanitizeTags } from "@/lib/tags";
import { DEFAULT_VOICE, isValidVoice, voiceModel, voiceSpeed } from "@/lib/tts-voices";
import { sanitizeAudioStats, type AudioStats } from "@/lib/audio-loudness";
import { ALLOWED_AUDIO, ALLOWED_EXT, AUDIO_SIZE_ERROR, MAX_AUDIO_BYTES } from "@/lib/audio-formats";

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
      model: voiceModel(safeVoice),
      voice: safeVoice,
      input: text,
      response_format: "mp3",
      // 음색별 속도 보정(미지정이면 API 기본 1.0) — tts-voices.ts 참고
      speed: voiceSpeed(safeVoice),
    });
    const arrayBuffer = await mp3Response.arrayBuffer();
    const audioBase64 = Buffer.from(arrayBuffer).toString("base64");
    return { audioBase64 };
  } catch (err) {
    console.error("[OpenAI TTS] 음성 생성 실패:", err);
    return { error: "음성 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  }
}

export async function saveSentence(
  englishText: string,
  koreanText: string,
  audioBase64: string,
  tags: string[] = [],
  audioMime: string = "audio/mpeg",
  audioExt: string = "mp3",
  note: string = "",
  audioStats: AudioStats | null = null,
): Promise<SaveSentenceResult> {
  const english = englishText.trim();
  const korean = koreanText.trim();
  const cleanNote = note.trim().slice(0, 1000);
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
    return { error: AUDIO_SIZE_ERROR };
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

  // 볼륨 균일화용 측정값. 클라이언트가 보낸 값이라 유한수인지 검증하고, 없으면 null(=재생 시 게인 1.0).
  const cleanStats = sanitizeAudioStats(audioStats);

  const { error: insertError } = await supabase.from("sentences").insert({
    user_id: user.id,
    english_text: english,
    korean_text: korean,
    audio_path: storagePath,
    tags: cleanTags,
    note: cleanNote,
    loudness_db: cleanStats?.loudnessDb ?? null,
    peak_db: cleanStats?.peakDb ?? null,
  });

  if (insertError) {
    console.error("[Supabase DB] 문장 저장 실패:", insertError);
    await supabase.storage.from("tts-audio").remove([storagePath]);
    return { error: "문장 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  }

  return { success: "문장이 저장되었습니다!" };
}
