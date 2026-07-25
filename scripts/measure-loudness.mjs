// 저장된 음성 파일의 라우드니스 일괄 측정 스크립트 (볼륨 균일화 백필)
//
// 실행: npm run audio:measure -- --dry-run     # DB 미변경, 측정 분포만 출력
//       npm run audio:measure                  # loudness_db 가 비어있는 행만 측정·저장
//       npm run audio:measure -- --force       # 전체 재측정
//       npm run audio:measure -- --email=other@example.com
//
// 원본 파일은 건드리지 않는다. ffmpeg는 "디코딩"에만 쓰고 측정은 src/lib/audio-loudness.ts 의
// measureSamples() 에 맡긴다 — ffmpeg volumedetect/ebur128 결과를 파싱하면 브라우저 측정과
// 알고리즘이 갈라져서 과거 데이터와 신규 데이터의 게인 기준이 달라진다.
//
// tts-audio 버킷은 비공개 + RLS라서 service-role 키로 RLS를 우회한다.
// (src/utils/supabase/admin.ts 는 "server-only" 가드가 있어 직접 import 불가 →
//  download-audio.mjs 와 동일하게 여기서 클라이언트를 자체 생성한다.)

import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { computeGain, measureSamples } from "../src/lib/audio-loudness.ts";

const DEFAULT_EMAIL = "82orez@naver.com";
const BUCKET = "tts-audio";
const PREVIEW_LEN = 40;

function parseArgs(argv) {
  const args = { email: DEFAULT_EMAIL, dryRun: false, force: false };
  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--force") {
      args.force = true;
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (key === "email" && value) args.email = value;
  }
  return args;
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

// 인코딩된 오디오 Buffer → 모노 Float32 샘플. ffmpeg로 디코딩만 수행한다.
// -ac 1 로 모노 다운믹스만 하고 리샘플링은 하지 않는다(RMS는 샘플레이트에 사실상 불변).
function decodeToMono(inputBuffer) {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-f", "f32le", "-ac", "1", "-c:a", "pcm_f32le", "pipe:1"]);

    const chunks = [];
    let stderr = "";

    ff.stdout.on("data", (c) => chunks.push(c));
    ff.stderr.on("data", (c) => (stderr += c.toString()));
    ff.on("error", (err) => reject(new Error(`ffmpeg 실행 실패: ${err.message} (ffmpeg가 설치되어 있는지 확인)`)));
    ff.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg 디코딩 실패(code ${code}): ${stderr.trim().split("\n")[0] ?? ""}`));
        return;
      }
      const buf = Buffer.concat(chunks);
      const usable = buf.byteLength - (buf.byteLength % 4);
      if (usable === 0) {
        reject(new Error("디코딩 결과가 비어 있음"));
        return;
      }
      // Buffer는 풀에서 잘라 쓰므로 byteOffset이 4바이트 정렬이 아닐 수 있다 → 사본으로 안전하게 변환
      const copy = buf.buffer.slice(buf.byteOffset, buf.byteOffset + usable);
      resolve(new Float32Array(copy));
    });

    ff.stdin.on("error", () => {}); // ffmpeg가 먼저 끊는 경우 EPIPE 무시
    ff.stdin.end(inputBuffer);
  });
}

function summarize(label, values) {
  if (values.length === 0) return;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const fmt = (n) => n.toFixed(2);
  console.log(`  ${label}: min ${fmt(sorted[0])} / median ${fmt(median)} / max ${fmt(sorted[sorted.length - 1])}`);
}

async function main() {
  const { email, dryRun, force } = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("환경 변수 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다. (.env 확인)");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`대상 계정: ${email}${dryRun ? " (dry-run — DB를 변경하지 않습니다)" : ""}`);
  const userId = await findUserIdByEmail(supabase, email);
  if (!userId) {
    console.error(`해당 이메일의 사용자를 찾을 수 없습니다: ${email}`);
    process.exit(1);
  }

  let query = supabase.from("sentences").select("id, english_text, audio_path, loudness_db").eq("user_id", userId).order("created_at");
  if (!force) query = query.is("loudness_db", null);

  const { data: rows, error: queryError } = await query;
  if (queryError) {
    console.error(`문장 목록 조회 실패: ${queryError.message}`);
    process.exit(1);
  }

  const sentences = rows ?? [];
  if (sentences.length === 0) {
    console.log(force ? "문장이 없습니다." : "측정이 필요한 문장이 없습니다. (전체 재측정은 --force)");
    return;
  }

  console.log(`총 ${sentences.length}건 측정 시작.\n`);

  const loudnessValues = [];
  const gainValues = [];
  const failures = [];
  let saved = 0;

  for (const row of sentences) {
    const preview = (row.english_text ?? "").replace(/\s+/g, " ").trim().slice(0, PREVIEW_LEN);

    const { data: blob, error: dlError } = await supabase.storage.from(BUCKET).download(row.audio_path);
    if (dlError || !blob) {
      failures.push({ preview, reason: dlError?.message ?? "빈 응답" });
      console.warn(`  실패: ${preview} (다운로드: ${dlError?.message ?? "빈 응답"})`);
      continue;
    }

    let stats;
    try {
      const samples = await decodeToMono(Buffer.from(await blob.arrayBuffer()));
      stats = measureSamples(samples);
    } catch (err) {
      failures.push({ preview, reason: err.message });
      console.warn(`  실패: ${preview} (${err.message})`);
      continue;
    }

    const gain = computeGain(stats.loudnessDb, stats.peakDb);
    loudnessValues.push(stats.loudnessDb);
    gainValues.push(gain);
    console.log(
      `  ${stats.loudnessDb.toFixed(2).padStart(7)} dB  peak ${stats.peakDb.toFixed(2).padStart(7)} dB  gain x${gain.toFixed(2)}  ${preview}`,
    );

    if (dryRun) continue;

    const { error: updateError } = await supabase.from("sentences").update({ loudness_db: stats.loudnessDb, peak_db: stats.peakDb }).eq("id", row.id);
    if (updateError) {
      failures.push({ preview, reason: `저장: ${updateError.message}` });
      console.warn(`  실패: ${preview} (저장: ${updateError.message})`);
      continue;
    }
    saved++;
  }

  console.log(`\n측정 완료: ${loudnessValues.length}/${sentences.length}건${dryRun ? " (저장 안 함)" : ` · 저장 ${saved}건`}`);
  summarize("라우드니스(dBFS)", loudnessValues);
  summarize("게인 배율", gainValues);

  if (failures.length > 0) {
    console.log(`\n실패 ${failures.length}건:`);
    for (const f of failures) console.log(`  - ${f.preview}: ${f.reason}`);
  }
}

main().catch((err) => {
  console.error("오류:", err.message ?? err);
  process.exit(1);
});
