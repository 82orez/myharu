// 음성 인식(Web Speech API) 가용성 판정.
//
// ⚠️ 핵심 gotcha: iOS는 모든 브라우저가 WebKit이지만, 음성 인식은 **Safari 앱 본체에만** 구현돼 있다.
//    Chrome/Edge/Firefox iOS와 인앱 브라우저(카카오톡·인스타 등)는 WKWebView를 쓰는데 여기엔
//    시스템 음성 인식기가 연결돼 있지 않다. 그런데 `webkitSpeechRecognition` **생성자는 존재**해서
//    `"webkitSpeechRecognition" in window` 검사는 통과한다 → start()가 마이크 권한만 요청하고
//    (Chrome iOS는 "마이크 액세스가 허용됨" 배너) 수음은 시작되지 않으며 onresult/onerror도 안 온다.
//    → 생성자 유무만으로 판단하지 말고 UA로 iOS 비-Safari를 먼저 걸러낸다.
//
// 디렉티브 없는 순수 모듈이지만 navigator/window에 의존하므로 브라우저(effect 안)에서만 호출할 것.

export type SpeechAvailability =
  | "available" // 정상 사용 가능
  | "ios-non-safari" // iOS의 Safari가 아닌 브라우저 — 생성자는 있어도 동작하지 않음
  | "unsupported"; // 생성자 자체가 없음

// iOS에서 WKWebView를 쓰는 브라우저·인앱 브라우저 UA 토큰.
// (Safari 본체 UA에는 이 중 아무것도 들어가지 않는다)
const IOS_WEBVIEW_UA = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|Whale|NAVER|DaumApps|KAKAOTALK|Instagram|FBAN|FBAV|Line\//i;

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+는 데스크톱 Safari UA를 보내므로 터치 포인트로 구분한다.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function getSpeechAvailability(): SpeechAvailability {
  if (typeof window === "undefined") return "unsupported";

  // 생성자가 있어도 iOS 비-Safari면 동작하지 않는다 → UA 판정을 먼저 한다.
  if (isIOS() && IOS_WEBVIEW_UA.test(navigator.userAgent)) return "ios-non-safari";

  const hasCtor = "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
  return hasCtor ? "available" : "unsupported";
}

export function speechUnavailableMessage(availability: SpeechAvailability): string | null {
  if (availability === "ios-non-safari") {
    return "iPhone·iPad에서는 Safari에서만 말하기(음성 인식)가 동작합니다. Safari로 열어 주세요. (쓰기는 그대로 사용할 수 있어요)";
  }
  if (availability === "unsupported") {
    return "이 브라우저에서는 음성 인식이 지원되지 않습니다. Chrome 또는 Edge 브라우저를 사용해 주세요.";
  }
  return null;
}

// UA 감지가 빗나가는 경우(새 인앱 브라우저 등)를 위한 워치독:
// start() 후 이 시간 안에 onstart/onaudiostart가 오지 않으면 "동작하지 않는 환경"으로 판정한다.
// 정상 환경에서는 start() 직후 수 ms 안에 onstart가 오므로 오탐 위험은 낮다.
export const SPEECH_START_TIMEOUT_MS = 3000;
