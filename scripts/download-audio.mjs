// 저장된 TTS 음성 파일 일괄 다운로드 스크립트
//
// 실행: npm run audio:download
//       npm run audio:download -- --out=./my-backup --email=other@example.com
//
// tts-audio 버킷은 비공개 + RLS라서 service-role 키로 RLS를 우회해 다운로드한다.
// (src/utils/supabase/admin.ts 는 "server-only" 가드가 있어 직접 import 불가 →
//  동일 env 변수로 여기서 클라이언트를 자체 생성한다.)

import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_EMAIL = "82orez@naver.com";
const DEFAULT_OUT = "./audio-backup";
const BUCKET = "tts-audio";
const MAX_NAME_LEN = 80;

function parseArgs(argv) {
  const args = { email: DEFAULT_EMAIL, out: DEFAULT_OUT };
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (key === "email" && value) args.email = value;
    if (key === "out" && value) args.out = value;
  }
  return args;
}

// 영어 문장 → 파일시스템 안전 파일명(확장자 제외)
function sanitize(text) {
  const cleaned = (text ?? "")
    .replace(/[\r\n\t]+/g, " ") // 개행/탭 → 공백
    .replace(/[/\\:*?"<>|]/g, "_") // 파일시스템 금지문자 → _
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LEN)
    .trim();
  return cleaned || "sentence";
}

async function findUserIdByEmail(supabase, email) {
  const perPage = 1000;
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`사용자 목록 조회 실패: ${error.message}`);
    const users = data?.users ?? [];
    const found = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (found) return found.id;
    if (users.length < perPage) break; // 마지막 페이지
  }
  return null;
}

async function main() {
  const { email, out } = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("환경 변수 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다. (.env 확인)");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`대상 계정: ${email}`);
  const userId = await findUserIdByEmail(supabase, email);
  if (!userId) {
    console.error(`해당 이메일의 사용자를 찾을 수 없습니다: ${email}`);
    process.exit(1);
  }

  const { data: rows, error: queryError } = await supabase
    .from("sentences")
    .select("id, english_text, audio_path")
    .eq("user_id", userId);
  if (queryError) {
    console.error(`문장 목록 조회 실패: ${queryError.message}`);
    process.exit(1);
  }

  const sentences = rows ?? [];
  if (sentences.length === 0) {
    console.log("다운로드할 문장이 없습니다.");
    return;
  }

  const outDir = path.resolve(process.cwd(), out);
  await mkdir(outDir, { recursive: true });
  console.log(`총 ${sentences.length}건. 저장 위치: ${outDir}`);

  const usedNames = new Set();
  let success = 0;
  const failures = [];

  for (const row of sentences) {
    const ext = path.extname(row.audio_path) || ".mp3";
    const base = sanitize(row.english_text);

    // 중복 파일명 회피 (-2, -3 …)
    let name = `${base}${ext}`;
    let counter = 2;
    while (usedNames.has(name.toLowerCase())) {
      name = `${base}-${counter}${ext}`;
      counter++;
    }
    usedNames.add(name.toLowerCase());

    const { data: blob, error: dlError } = await supabase.storage.from(BUCKET).download(row.audio_path);
    if (dlError || !blob) {
      failures.push({ path: row.audio_path, reason: dlError?.message ?? "빈 응답" });
      console.warn(`  실패: ${row.audio_path} (${dlError?.message ?? "빈 응답"})`);
      continue;
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    await writeFile(path.join(outDir, name), buffer);
    success++;
    console.log(`  저장: ${name}`);
  }

  console.log(`\n완료: ${success}/${sentences.length}건 저장.`);
  if (failures.length > 0) {
    console.log(`실패 ${failures.length}건:`);
    for (const f of failures) console.log(`  - ${f.path}: ${f.reason}`);
  }
}

main().catch((err) => {
  console.error("오류:", err.message ?? err);
  process.exit(1);
});
