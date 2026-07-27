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
