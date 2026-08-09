import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getOpenAIClient } from "@/lib/openai";

// next-repeater에서 가져온 라우트. 원본 대비 달라진 점:
//  ① 로그인 사용자만 허용(myharu의 모든 서버 진입점 규칙)
//  ② OpenAI 클라이언트를 새로 만들지 않고 lib/openai.ts 싱글턴 재사용
// 라우트 핸들러라 서버 액션의 bodySizeLimit과 무관하다. 단 Vercel 서버리스 요청 본문 4.5MB 벽은 남으므로
// 실제 호출은 A–B 구간 클립(보통 수백 KB)에만 쓴다.

const MODELS = ["gpt-4o-transcribe", "gpt-4o-mini-transcribe", "whisper-1"] as const;
const MAX_BYTES = 25 * 1024 * 1024; // OpenAI 오디오 업로드 제한 25MB

// ⚠️ srt/vtt/verbose_json은 whisper-1 전용 — gpt-4o-transcribe 계열은 json만 지원한다(OpenAI SDK 문서).
//    all = verbose_json으로 한 번 호출해 텍스트와 구간을 함께 받는다(호출·비용은 srt 하나와 동일).
const FORMATS = ["text", "srt", "vtt", "all"] as const;
const SUBTITLE_FORMATS = new Set(["srt", "vtt", "all"]);
const SUBTITLE_MODEL = "whisper-1";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return jsonError("로그인이 필요합니다.", 401);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("잘못된 요청입니다.", 400);
  }

  const file = form.get("file");
  const model = form.get("model");
  // 미지정이면 text
  const format = form.get("format") ?? "text";

  if (!(file instanceof File) || file.size === 0) {
    return jsonError("오디오 파일을 첨부해 주세요.", 400);
  }
  if (file.size > MAX_BYTES) {
    return jsonError("파일이 25MB를 초과합니다. 더 작은 파일로 시도해 주세요.", 413);
  }
  if (typeof model !== "string" || !MODELS.includes(model as any)) {
    return jsonError("잘못된 모델입니다.", 400);
  }
  if (typeof format !== "string" || !FORMATS.includes(format as any)) {
    return jsonError("잘못된 출력 형식입니다.", 400);
  }
  if (SUBTITLE_FORMATS.has(format) && model !== SUBTITLE_MODEL) {
    return jsonError("자막 형식은 whisper-1에서만 지원합니다.", 400);
  }

  try {
    const openai = getOpenAIClient();

    // all은 verbose_json(객체) — 나머지 셋은 문자열이라 반환 타입이 달라 호출을 분기한다
    if (format === "all") {
      const res = await openai.audio.transcriptions.create({ file, model, response_format: "verbose_json" });
      // tokens/logprobs 등 큰 필드는 버리고 Cue 모양({start,end,text})만 넘긴다
      const cues = (res.segments ?? []).map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }));
      return NextResponse.json({ text: res.text, cues });
    }

    const text = await openai.audio.transcriptions.create({
      file,
      model,
      response_format: format as "text" | "srt" | "vtt",
    });

    return NextResponse.json({ text });
  } catch (err: any) {
    if (err?.message?.includes("OPENAI_API_KEY")) {
      return jsonError("서버에 OpenAI API 키가 설정되지 않았습니다.", 500);
    }
    if (err?.status === 401) {
      return jsonError("OpenAI API 키가 유효하지 않습니다.", 500);
    }
    if (err?.status === 429) {
      return jsonError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
    }
    return jsonError("텍스트 추출 중 오류가 발생했습니다.", 500);
  }
}
