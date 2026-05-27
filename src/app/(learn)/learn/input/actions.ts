"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getOpenAIClient } from "@/lib/openai";

export type InputState = { error?: string; success?: string } | null;

export async function createSentence(_prev: InputState, formData: FormData): Promise<InputState> {
  const englishText = String(formData.get("englishText") ?? "").trim();
  const koreanText = String(formData.get("koreanText") ?? "").trim();

  if (!englishText || !koreanText) {
    return { error: "영어 문장과 한국어 뜻을 모두 입력해 주세요." };
  }

  if (englishText.length > 500) {
    return { error: "영어 문장은 500자 이내로 입력해 주세요." };
  }

  if (koreanText.length > 500) {
    return { error: "한국어 뜻은 500자 이내로 입력해 주세요." };
  }

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "로그인이 필요합니다." };
  }

  let audioBuffer: Buffer;
  try {
    const openai = getOpenAIClient();
    const mp3Response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: englishText,
      response_format: "mp3",
    });
    const arrayBuffer = await mp3Response.arrayBuffer();
    audioBuffer = Buffer.from(arrayBuffer);
  } catch (err) {
    console.error("[OpenAI TTS] 음성 생성 실패:", err);
    return { error: "음성 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  }

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
    english_text: englishText,
    korean_text: koreanText,
    audio_path: storagePath,
  });

  if (insertError) {
    console.error("[Supabase DB] 문장 저장 실패:", insertError);
    await supabase.storage.from("tts-audio").remove([storagePath]);
    return { error: "문장 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  }

  return { success: "문장이 저장되었습니다!" };
}
