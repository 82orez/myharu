// 음성 인식(Web Speech API) 가용성 판정.
//
// ⚠️ 핵심 gotcha: iOS에서 `"webkitSpeechRecognition" in window`는 **믿을 수 없다.**
//    WKWebView 기반 브라우저(iOS Chrome/Edge/Firefox, 카카오톡·인스타 인앱)에서 생성자는 존재하지만,
//    실제 인식은 embed한 앱이 마이크·음성 인식 usage description과 권한 델리게이트를 갖췄을 때만 동작한다.
//    안 갖춰진 앱에서는 start()가 마이크 권한만 요청하고(Chrome iOS는 "마이크 액세스가 허용됨" 배너)
//    수음도, onresult/onerror/onend도 **영영 오지 않는다**(= 말하기 버튼이 먹통).
//
// ⚠️ 그렇다고 UA로 미리 차단하지 말 것. 앱·버전에 따라 정상 동작하는 조합이 있어서
//    사전 차단은 멀쩡히 되는 환경에서 기능을 빼앗는다. **실제 start() 결과(워치독)로만 판정한다.**
//    UA(`isIOS`)는 실패했을 때 "어떤 안내를 보여줄지" 고르는 데만 쓴다.
//
// 디렉티브 없는 순수 모듈이지만 navigator/window에 의존하므로 브라우저(effect·핸들러 안)에서만 호출할 것.

import { textsMatch } from "@/lib/normalize-text";

export type SpeechAvailability =
  | "available" // 사용 가능(또는 아직 실패가 관측되지 않음)
  | "ios-non-safari" // iOS인데 수음이 시작되지 않음
  | "unsupported"; // 생성자가 없거나 수음이 시작되지 않음

// 같은 탭 안에서 실패를 기억한다(매번 3초씩 기다리게 하지 않기 위함).
// sessionStorage라 탭을 닫거나 브라우저를 바꾸면 다시 판정한다 — 오탐이 영구화되지 않는다.
const FAILURE_KEY = "myharu:speech-unavailable";

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+는 데스크톱 Safari UA를 보내므로 터치 포인트로 구분한다.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// 수음이 시작되지 않았을 때의 판정 결과(안내 문구 선택용).
export function unavailableKind(): Exclude<SpeechAvailability, "available"> {
  return isIOS() ? "ios-non-safari" : "unsupported";
}

function readFailure(): SpeechAvailability | null {
  try {
    const saved = sessionStorage.getItem(FAILURE_KEY);
    return saved === "ios-non-safari" || saved === "unsupported" ? saved : null;
  } catch {
    return null; // 프라이빗 모드 등에서 접근 실패 — 그냥 다시 판정한다
  }
}

export function rememberUnavailable(availability: SpeechAvailability): void {
  try {
    sessionStorage.setItem(FAILURE_KEY, availability);
  } catch {
    // 저장 실패는 무시(다음에 다시 판정)
  }
}

// 실제로 수음이 시작되면 과거 실패 기록을 지운다.
export function forgetUnavailable(): void {
  try {
    sessionStorage.removeItem(FAILURE_KEY);
  } catch {
    // 무시
  }
}

/** 녹음(MediaRecorder + getUserMedia) 가능 여부 — 서버 STT 경로의 전제. */
export function isMediaRecorderSupported(): boolean {
  if (typeof window === "undefined") return false;
  return typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * 브라우저 인식 대신 **녹음 → 서버 STT**를 쓸지 판정.
 * ⚠️ iOS는 Safari라도 Web Speech가 최종 결과를 주지 않거나 두 번째 시도부터 침묵하는 사례가 많아
 *    UA로 서버 경로를 기본값으로 삼는다(여기가 "UA로 사전 차단하지 말 것" 규칙의 예외 —
 *    기능을 빼앗는 게 아니라 더 튼튼한 경로로 바꾸는 것이라 안전하다).
 * `availability`가 null(판정 전)이면 아직 결정하지 않는다(false).
 */
export function preferServerStt(availability: SpeechAvailability | null): boolean {
  if (availability === null) return false;
  return isIOS() || availability !== "available";
}

export function getSpeechAvailability(): SpeechAvailability {
  if (typeof window === "undefined") return "unsupported";

  const hasCtor = "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
  if (!hasCtor) return unavailableKind();

  // 생성자가 있으면 일단 사용 가능으로 두고 실제 동작으로 검증한다.
  return readFailure() ?? "available";
}

export function speechUnavailableMessage(availability: SpeechAvailability): string | null {
  if (availability === "ios-non-safari") {
    return "이 브라우저에서 음성 인식이 시작되지 않았습니다. iPhone·iPad에서는 Safari에서 가장 안정적으로 동작하니 Safari로 열어 보세요. (쓰기는 그대로 사용할 수 있어요)";
  }
  if (availability === "unsupported") {
    return "이 브라우저에서는 음성 인식이 동작하지 않습니다. Chrome 또는 Edge 브라우저를 사용해 주세요.";
  }
  return null;
}

// start() 후 이 시간 안에 onstart/onaudiostart가 오지 않으면 "동작하지 않는 환경"으로 판정한다.
// 정상 환경에서는 start() 직후 수 ms 안에 onstart가 오므로 오탐 위험은 낮다.
export const SPEECH_START_TIMEOUT_MS = 3000;

// 수음이 시작된(onstart) 뒤에도 이 시간 안에 결과·에러·종료가 하나도 오지 않으면 세션을 끊고 복귀한다.
// ⚠️ 시작 워치독만으로는 부족하다: iOS Safari는 onstart만 발생시키고 이후 아무 이벤트도 주지 않는
//    경우가 있어, 그때 "듣는 중..."에 영구 고착된다(실제로 겪음). 원인 불문 탈출구로 유지할 것.
export const SPEECH_SESSION_TIMEOUT_MS = 15000;

// 인식 엔진에 요청할 후보 개수(`recognition.maxAlternatives`).
// 엔진이 이보다 적게 돌려주는 경우가 흔하므로 "최대치"로만 이해할 것.
export const MAX_SPEECH_ALTERNATIVES = 5;

// onresult 이벤트에서 후보 문장들을 뽑는다(1순위부터 순서대로).
function speechAlternatives(event: any): string[] {
  const result = event?.results?.[0];
  if (!result) return [];
  const texts: string[] = [];
  for (let i = 0; i < result.length; i++) {
    const transcript = result[i]?.transcript?.trim();
    if (transcript) texts.push(transcript);
  }
  return texts;
}

// ⚠️ **1순위 후보만 채점하지 말 것.** 엔진은 보통 여러 후보를 돌려주는데, 정답을 정확히 말해도
//    동음이의(there/their)·관사 유무 같은 이유로 1순위가 빗나가고 2~3순위가 정확한 경우가 잦다.
//    후보 전부에 textsMatch를 돌려 **유사도가 가장 높은 것**을 채택한다
//    (normalize-text의 normalizedVariants가 정규화형을 여러 개 두고 최대치를 취하는 것과 같은 발상).
//
// 표시용 문장(`text`)은 판정 결과에 따라 다르다:
//   - 정답이면 실제로 맞은 후보(1순위가 아닐 수 있음)
//   - 오답이면 **1순위** — 오답인데 "정답에 가장 가까운 후보"를 보여주면 실제보다 잘 말한 것처럼 보인다.
export function pickBestAlternative(
  event: any,
  target: string,
  threshold?: number,
): { text: string; match: boolean; similarity: number; alternatives: string[] } {
  const alternatives = speechAlternatives(event);
  const top = alternatives[0] ?? "";

  let best = top;
  let bestSimilarity = 0;
  let bestMatch = false;

  for (const text of alternatives) {
    const { match, similarity } = textsMatch(text, target, threshold);
    if (similarity > bestSimilarity) {
      best = text;
      bestSimilarity = similarity;
      bestMatch = match;
    }
  }

  return { text: bestMatch ? best : top, match: bestMatch, similarity: bestSimilarity, alternatives };
}

export type SpeechGrade = ReturnType<typeof pickBestAlternative>;

// 후보 없이 문장 하나만 있을 때(중간 결과 폴백)의 채점.
export function gradeTranscript(text: string, target: string, threshold?: number): SpeechGrade {
  const { match, similarity } = textsMatch(text, target, threshold);
  return { text, match, similarity, alternatives: [text] };
}

// ⚠️ iOS Safari는 발화 종료를 스스로 잡지 못해 **최종 결과(isFinal)를 내보내지 않는 경우가 있다.**
//    그래서 `interimResults = true`로 중간 결과를 받아 두고, 무음이 이어지면 stop()으로 최종 결과를 유도하며,
//    그래도 최종이 없으면 마지막 중간 결과로 채점한다(아래 두 헬퍼 + SPEECH_SILENCE_STOP_MS).
//    `interimResults = false`로 되돌리지 말 것 — 아이폰에서 "듣는 중"에 갇히거나 응답 없음 토스트만 뜬다.
export const SPEECH_SILENCE_STOP_MS = 2000;

export function isFinalResult(event: any): boolean {
  const results = event?.results;
  if (!results) return false;
  const index = typeof event.resultIndex === "number" ? event.resultIndex : results.length - 1;
  return Boolean(results[index]?.isFinal ?? results[0]?.isFinal);
}

/** 방금 도착한 결과(중간 포함)의 1순위 문장. */
export function latestTranscript(event: any): string {
  const results = event?.results;
  if (!results) return "";
  const index = typeof event.resultIndex === "number" ? event.resultIndex : results.length - 1;
  return (results[index]?.[0]?.transcript ?? results[0]?.[0]?.transcript ?? "").trim();
}
