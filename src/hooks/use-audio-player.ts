"use client";

import { useCallback, useEffect, useRef } from "react";
import { isIOS } from "@/lib/speech-recognition";

// 문장 오디오 재생 공용 훅 (ReviewClient·QuizView 공유).
//
// 볼륨 균일화: 저장된 측정값으로 계산한 게인(computeGain)을 Web Audio GainNode로 적용한다.
// audio.volume은 0~1이라 증폭이 불가능해 조용한 파일을 끌어올릴 수 없다 → GainNode를 쓴다.
//
// ⚠️ 엘리먼트를 2개 유지한다 (iOS Chrome 무음 대응).
//    createMediaElementSource에 물린 엘리먼트는 소리가 오직 AudioContext.destination으로만 나간다.
//    iOS에서 음성 인식(SpeechRecognition)이 마이크를 잡으면 오디오 세션이 녹음으로 전환되며
//    AudioContext가 "interrupted" 상태가 되는데, WKWebView 기반 브라우저(iOS Chrome 등)는 여기서
//    복귀하지 못한다. 이때 el.play()는 예외 없이 resolve되므로 onError도 안 타고 그냥 "무음"이 된다.
//    → 증폭이 필요할 때만(gain > 1) GainNode 경로를 쓰고, 컨텍스트가 running이 아니면
//      Web Audio에 물리지 않은 plain 엘리먼트로 폴백해 재생한다(증폭은 포기, 무음보다 낫다).
// ⚠️ createMediaElementSource는 엘리먼트당 단 한 번만 호출할 수 있다.
//    그래서 재생마다 new Audio()를 만들지 않고 엘리먼트를 재사용하며 src만 교체한다.
// ⚠️ crossOrigin은 반드시 src 대입보다 먼저 설정해야 한다. 순서가 바뀌면 크로스 오리진 소스가
//    taint되어 예외 없이 "무음"으로 재생된다. (Supabase Storage는 CORS 허용 확인 완료)
//
// ⚠️ iOS 앞부분 잘림 (pre-roll을 걷어내지 말 것).
//    아이폰에서 "듣기" 첫 단어가 잘린다는 제보 → 사용자 문장 61개의 오디오를 디코딩해
//    첫 소리까지의 무음(lead-in)을 실측하니 두 무리로 갈렸다:
//      47~70ms(34개) = 잘린다고 지목된 카드 / 142~558ms(27개) = 정상이라고 확인된 카드.
//    즉 파일·코덱(전부 mp3 48kHz) 문제도, 볼륨 보정 경로 문제도 아니고
//    iOS가 재생 시작 직후 ~0.1초의 출력을 삼키는 것이다. 여백이 그보다 긴 파일은 티가 안 날 뿐이다.
//    → iOS에서만 소리를 끈 채로 IOS_PREROLL_MS 동안 흘려보낸 뒤 currentTime을 0으로 되감아 재생한다.
//    (버퍼링이 원인이라 보고 "준비 대기"만 넣었던 앞선 수정으로는 해결되지 않았다)
//
// 재생 상태(playingId / isPlaying)는 호출하는 컴포넌트가 그대로 소유한다 —
// 기존의 상호 배제·버튼 비활성 로직을 건드리지 않기 위함.

type PlayHandlers = {
  onEnded?: () => void;
  onError?: () => void;
};

type Nodes = {
  plain: HTMLAudioElement; // Web Audio 미연결 — 항상 스피커로 직접 출력
  boosted: HTMLAudioElement | null; // GainNode 경유 — 증폭용
  ctx: AudioContext | null;
  gain: GainNode | null;
};

// 인터럽트 직후엔 resume이 곧바로 먹지 않을 수 있어 한 번 더 시도한다.
const RESUME_RETRY_MS = 150;

// 버퍼가 찰 때까지 기다리는 최대 시간. 넘으면 그냥 재생을 시도한다(느린 네트워크에서 무한 대기 방지).
const READY_TIMEOUT_MS = 2000;
// iOS 전용 무음 pre-roll 길이. 기기가 삼키는 구간(~0.1초)보다 넉넉히 잡는다.
// 첫 단어가 여전히 잘리면 늘리고, 탭 반응이 굼뜨면 줄인다. (실측 근거는 파일 헤더 주석 참고)
const IOS_PREROLL_MS = 400;
// 잠금 해제용 무음 재생을 되돌리기까지의 최대 대기
const WARMUP_RESTORE_MS = 400;
// 0.05초 무음 WAV(8kHz 모노 16bit) — iOS 오디오 세션을 미리 깨우는 용도
const SILENT_WAV = `data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAA${"A".repeat(1067)}==`;

// readyState가 HAVE_FUTURE_DATA(3) 이상이 될 때까지 기다린다.
// ⚠️ src 대입 직후 곧바로 play()하면 iOS Safari에서 재생 클럭만 흘러가고 출력이 늦게 붙어
//    앞부분이 통째로 유실된다(아이폰에서 듣기 앞 1초가 잘린다는 제보). 반드시 준비를 기다릴 것.
function waitUntilReady(el: HTMLAudioElement, timeoutMs = READY_TIMEOUT_MS): Promise<void> {
  if (el.readyState >= 3) return Promise.resolve();

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const type of ["canplaythrough", "canplay", "error"] as const) el.removeEventListener(type, finish);
      resolve();
    };

    const timer = setTimeout(finish, timeoutMs);
    for (const type of ["canplaythrough", "canplay", "error"] as const) el.addEventListener(type, finish);
  });
}

export function useAudioPlayer() {
  const nodesRef = useRef<Nodes | null>(null);
  const activeRef = useRef<HTMLAudioElement | null>(null);
  // onEnded/onError는 재생마다 달라지므로 ref에 담고 엘리먼트 핸들러는 한 번만 등록한다.
  const handlersRef = useRef<PlayHandlers>({});
  // 재생 요청 순번 — 준비를 기다리는 사이 다음 재생이 끼어들면 이전 요청은 조용히 폐기한다.
  const requestRef = useRef(0);

  const createElement = useCallback((): HTMLAudioElement => {
    const el = new Audio();
    el.crossOrigin = "anonymous"; // ★ src 대입 전에 설정
    el.preload = "auto";
    el.onended = () => handlersRef.current.onEnded?.();
    el.onerror = () => handlersRef.current.onError?.();
    return el;
  }, []);

  // 최초 재생(사용자 제스처 안)에서 지연 초기화.
  const ensureNodes = useCallback((): Nodes => {
    if (nodesRef.current) return nodesRef.current;
    nodesRef.current = { plain: createElement(), boosted: null, ctx: null, gain: null };
    return nodesRef.current;
  }, [createElement]);

  // 증폭 경로는 실제로 필요할 때만 만든다(게인 ≤ 1이면 AudioContext 자체를 만들지 않는다).
  const ensureBoosted = useCallback(
    (nodes: Nodes): boolean => {
      if (nodes.ctx && nodes.gain && nodes.boosted) return true;

      const Ctx: typeof AudioContext | undefined = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!Ctx) return false; // Web Audio 미지원 — plain 폴백

      try {
        const ctx = new Ctx();
        const gain = ctx.createGain();
        const el = createElement();
        ctx.createMediaElementSource(el).connect(gain).connect(ctx.destination);

        // iOS는 오디오 세션 인터럽트(마이크 점유 등)로 컨텍스트를 멈춘다. 복귀 시 자동으로 되살린다.
        ctx.onstatechange = () => {
          if (ctx.state !== "running" && ctx.state !== "closed") void ctx.resume().catch(() => {});
        };

        nodes.ctx = ctx;
        nodes.gain = gain;
        nodes.boosted = el;
        return true;
      } catch {
        return false; // 컨텍스트 생성 실패 — plain 폴백
      }
    },
    [createElement],
  );

  // running이 아니면 resume을 시도하고, 최종 상태가 running인지 알려준다.
  // ("interrupted"는 표준 타입에 없는 WebKit 전용 상태라 `!== "running"`으로 통째로 잡는다.)
  const tryResume = useCallback(async (ctx: AudioContext): Promise<boolean> => {
    // await 사이에 상태가 바뀌므로 매번 다시 읽는다(TS가 좁혀버리지 않도록 string으로 취급).
    const stateOf = () => ctx.state as string;

    if (stateOf() === "running") return true;
    if (stateOf() === "closed") return false;

    try {
      await ctx.resume();
    } catch {
      // resume 실패해도 아래에서 한 번 더 시도한다
    }
    if (stateOf() === "running") return true;

    await new Promise((resolve) => setTimeout(resolve, RESUME_RETRY_MS));
    try {
      await ctx.resume();
    } catch {
      // 여기까지 실패면 폴백 경로로 간다
    }
    return stateOf() === "running";
  }, []);

  const play = useCallback(
    async (url: string, gainValue: number, handlers: PlayHandlers = {}) => {
      const nodes = ensureNodes();
      const request = ++requestRef.current;

      handlersRef.current = handlers;
      const safeGain = Number.isFinite(gainValue) && gainValue > 0 ? gainValue : 1;

      // 이전 재생 정지(경로가 바뀔 수 있으므로 양쪽 다)
      nodes.plain.pause();
      nodes.boosted?.pause();

      // 증폭이 필요하고, 컨텍스트를 running으로 만들 수 있을 때만 GainNode 경로를 쓴다.
      let el = nodes.plain;
      let useBoosted = false;
      if (safeGain > 1 && ensureBoosted(nodes)) {
        useBoosted = await tryResume(nodes.ctx);
        if (useBoosted) {
          nodes.gain.gain.value = safeGain;
          el = nodes.boosted;
        } else {
          // iOS Chrome에서 음성 인식 후 컨텍스트가 살아나지 않는 케이스.
          // 증폭을 포기하고 plain 엘리먼트로 재생한다(무음 방지).
          console.warn("[Audio] AudioContext가 running이 아니라 볼륨 보정 없이 재생합니다.");
        }
      }

      if (!useBoosted) el.volume = Math.min(1, safeGain); // 폴백: 증폭 불가, 감쇠만

      activeRef.current = el;
      el.muted = false; // 방어: 어떤 경로로든 음소거가 남아 있으면 해제
      el.src = url; // src 대입이 currentTime을 0으로 되돌린다
      el.load();

      // 버퍼가 찰 때까지 기다렸다 재생한다(느린 네트워크 대비).
      await waitUntilReady(el);
      if (request !== requestRef.current) return; // 기다리는 사이 다음 재생이 끼어듦 — 조용히 폐기
      el.currentTime = 0;

      // iOS는 재생 시작 직후 ~0.1초 출력을 삼킨다 → 무음으로 먼저 흘려보낸 뒤 0으로 되감아 재생한다.
      // (증폭 경로는 muted가 그래프 입력까지 끄는지 보장되지 않아 GainNode를 0으로 내린다)
      const preroll = isIOS();
      const unsilence = () => {
        if (useBoosted) nodes.gain.gain.value = safeGain;
        else el.muted = false;
      };

      if (preroll) {
        if (useBoosted) nodes.gain.gain.value = 0;
        else el.muted = true;
      }

      // ⚠️ play()를 await 해서 pre-roll 타이밍을 잡지 말 것 — 탭이 백그라운드로 가는 등
      //    프로미스가 영영 resolve되지 않는 상황에서 소리가 음소거인 채로 굳는다.
      //    에러 처리만 프로미스에 걸고, 복구 타이밍은 타이머로 독립시킨다.
      el.play().catch((err) => {
        if (preroll) unsilence();
        // 다음 재생이 끼어들어 취소된 경우(AbortError)는 정상 흐름이라 무시한다
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[Audio] 재생 실패:", err);
        handlers.onError?.();
      });

      if (!preroll) return;

      await new Promise((resolve) => setTimeout(resolve, IOS_PREROLL_MS));
      if (request !== requestRef.current) return; // 그 사이 다른 재생·정지가 있었음 — 건드리지 않는다

      el.currentTime = 0; // 삼켜진 구간을 되감는다
      unsilence();
      // pre-roll보다 짧은 음원이라 이미 끝난 경우
      if (el.paused) void el.play().catch(() => {});
    },
    [ensureNodes, ensureBoosted, tryResume],
  );

  const stop = useCallback(() => {
    // ⚠️ 순번을 올려 진행 중인 pre-roll 대기를 무효화한다.
    //    안 그러면 정지 직후 pre-roll 타이머가 깨어나 재생을 되살린다.
    requestRef.current++;
    const nodes = nodesRef.current;
    if (!nodes) return;
    handlersRef.current = {}; // 정지는 onEnded/onError를 발생시키지 않는다
    nodes.plain.pause();
    nodes.boosted?.pause();
    activeRef.current = null;
  }, []);

  // 첫 사용자 입력에서 무음을 짧게 재생해 iOS 오디오 세션을 미리 깨워 둔다.
  // (제스처 밖에서 시작하는 재생이 세션 활성화를 기다리다 앞부분을 잃는 것을 줄인다)
  useEffect(() => {
    let warmed = false;

    const warmUp = () => {
      if (warmed) return;
      warmed = true;

      const nodes = ensureNodes();
      if (nodes.ctx) void tryResume(nodes.ctx);

      // ⚠️ 재생용 엘리먼트(nodes.plain)를 재사용하면 안 된다 —
      //    "듣기" 탭이 곧 첫 pointerdown이라, 워밍업의 정리 로직이 방금 시작된 진짜 재생을
      //    pause/​src 제거로 죽인다. 세션 활성화는 프로세스 단위라 별도 엘리먼트로도 충분하다.
      const el = new Audio(SILENT_WAV);
      el.muted = true;

      // ⚠️ 음소거 해제/정리를 play() 프로미스에만 맡기면 안 된다 — 프로미스가 resolve되지 않는
      //    환경(백그라운드 탭 등)에서 그대로 굳는다(feedback-sound에서 겪은 함정). 타이머 폴백 필수.
      const restore = () => {
        try {
          el.pause();
          el.removeAttribute("src");
        } catch {
          // 무시
        }
      };

      try {
        void Promise.resolve(el.play()).then(restore).catch(restore);
        setTimeout(restore, WARMUP_RESTORE_MS);
      } catch {
        restore();
      }
    };

    const events = ["pointerdown", "touchend", "keydown"] as const;
    for (const type of events) window.addEventListener(type, warmUp, { once: true, passive: true });
    return () => {
      for (const type of events) window.removeEventListener(type, warmUp);
    };
  }, [ensureNodes, tryResume]);

  // 언마운트 시 정리 (페이지 이탈 후 소리가 남는 것을 막는다)
  useEffect(() => {
    return () => {
      requestRef.current++; // 진행 중인 pre-roll 대기 무효화 (페이지 이탈 후 되살아나는 것 방지)
      const nodes = nodesRef.current;
      if (!nodes) return;
      handlersRef.current = {};
      for (const el of [nodes.plain, nodes.boosted]) {
        if (!el) continue;
        el.onended = null;
        el.onerror = null;
        el.pause();
      }
      if (nodes.ctx) {
        nodes.ctx.onstatechange = null;
        void nodes.ctx.close().catch(() => {});
      }
      activeRef.current = null;
      nodesRef.current = null;
    };
  }, []);

  return { play, stop };
}
