import "server-only";
import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY 환경 변수가 설정되지 않았습니다.");
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}
