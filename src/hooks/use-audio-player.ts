"use client";

import { useCallback, useEffect, useRef } from "react";

// 문장 오디오 재생 공용 훅 (ReviewClient·QuizView 공유).
//
// 볼륨 균일화: 저장된 측정값으로 계산한 게인(computeGain)을 Web Audio GainNode로 적용한다.
// audio.volume은 0~1이라 증폭이 불가능해 조용한 파일을 끌어올릴 수 없다 → GainNode를 쓴다.
//
// 재생 경로는 2가지다:
//   ① 게인 ≤ 1 (또는 Web Audio 실패) → plain HTMLAudioElement 직접 재생
//   ② 게인 > 1 → fetch + decodeAudioData 로 통째로 디코딩해 AudioBufferSourceNode → GainNode → destination
//
// ⚠️ 증폭 경로에 **createMediaElementSource(미디어 엘리먼트)를 쓰지 말 것** — iOS에서 앞부분이 잘린다.
//    아이폰에서 "듣기" 첫 단어가 잘린다는 제보를 여러 차례 잘못 진단한 끝에 실측으로 확정한 내용:
//      · 같은 파일이라도 편집 폼의 <audio controls> 미리듣기는 멀쩡했다.
//      · 진단 페이지(/learn/audio-test, 원인 확정 후 삭제)에서 재생 방식 5종을 비교한 결과
//        엘리먼트 재사용·crossOrigin·코드 호출 여부와 무관하게 **전부 정상**이었다.
//        차이는 하나, 그 페이지엔 증폭(Web Audio) 경로가 없다는 것.
//      · 결정적 확인: 앞여백이 63~70ms로 짧지만 게인 ≤ 1이라 증폭을 안 거치는 카드 3개는 **정상**,
//        같은 정도의 앞여백에 증폭을 거치는 카드들만 잘렸다.
//    → 즉 범인은 파일도, 버퍼링도, 앞여백도 아니고 **MediaElementAudioSourceNode 경로**다.
//      디코딩된 AudioBuffer로 재생하면(진단 페이지의 E 방식) 증폭을 유지하면서 잘림이 사라진다.
//
// ⚠️ iOS에서 음성 인식(SpeechRecognition)이 마이크를 잡으면 AudioContext가 WebKit 전용
//    "interrupted" 상태가 되고, WKWebView 기반 브라우저는 여기서 복귀하지 못하기도 한다.
//    → 컨텍스트를 running으로 만들지 못하면 증폭을 포기하고 plain 엘리먼트로 폴백한다(무음보다 낫다).
//
// 재생 상태(playingId / isPlaying)는 호출하는 컴포넌트가 그대로 소유한다 —
// 기존의 상호 배제·버튼 비활성 로직을 건드리지 않기 위함.

type PlayHandlers = {
  onEnded?: () => void;
  onError?: () => void;
};

type Nodes = {
  plain: HTMLAudioElement; // Web Audio 미연결 — 항상 스피커로 직접 출력
  ctx: AudioContext | null;
  gain: GainNode | null;
  source: AudioBufferSourceNode | null; // 현재 재생 중인 버퍼 소스
};

// 인터럽트 직후엔 resume이 곧바로 먹지 않을 수 있어 한 번 더 시도한다.
const RESUME_RETRY_MS = 150;
// 버퍼가 찰 때까지 기다리는 최대 시간. 넘으면 그냥 재생을 시도한다(느린 네트워크에서 무한 대기 방지).
const READY_TIMEOUT_MS = 2000;
// 잠금 해제용 무음 재생을 되돌리기까지의 최대 대기
const WARMUP_RESTORE_MS = 400;
// 디코딩 결과 캐시 상한(문장 수 기준). 3초 모노 48kHz ≈ 0.6MB.
const BUFFER_CACHE_MAX = 8;
// 0.05초 무음 WAV(8kHz 모노 16bit) — iOS 오디오 세션을 미리 깨우는 용도
const SILENT_WAV = `data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAA${"A".repeat(1067)}==`;

// readyState가 HAVE_FUTURE_DATA(3) 이상이 될 때까지 기다린다(느린 네트워크에서 재생 시작 지연 방지).
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
  // onEnded/onError는 재생마다 달라지므로 ref에 담고 엘리먼트 핸들러는 한 번만 등록한다.
  const handlersRef = useRef<PlayHandlers>({});
  // 재생 요청 순번 — 준비를 기다리는 사이 다음 재생·정지가 끼어들면 이전 요청은 조용히 폐기한다.
  const requestRef = useRef(0);
  const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());

  // 최초 재생(사용자 제스처 안)에서 지연 초기화.
  const ensureNodes = useCallback((): Nodes => {
    if (nodesRef.current) return nodesRef.current;
    const el = new Audio();
    el.preload = "auto";
    el.onended = () => handlersRef.current.onEnded?.();
    el.onerror = () => handlersRef.current.onError?.();
    nodesRef.current = { plain: el, ctx: null, gain: null, source: null };
    return nodesRef.current;
  }, []);

  // 증폭 경로는 실제로 필요할 때만 만든다(게인 ≤ 1이면 AudioContext 자체를 만들지 않는다).
  const ensureCtx = useCallback((nodes: Nodes): boolean => {
    if (nodes.ctx && nodes.gain) return true;

    const Ctx: typeof AudioContext | undefined = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return false; // Web Audio 미지원 — plain 폴백

    try {
      const ctx = new Ctx();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);

      // iOS는 오디오 세션 인터럽트(마이크 점유 등)로 컨텍스트를 멈춘다. 복귀 시 자동으로 되살린다.
      ctx.onstatechange = () => {
        if (ctx.state !== "running" && ctx.state !== "closed") void ctx.resume().catch(() => {});
      };

      nodes.ctx = ctx;
      nodes.gain = gain;
      return true;
    } catch {
      return false; // 컨텍스트 생성 실패 — plain 폴백
    }
  }, []);

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

  // 디코딩 결과 캐시(같은 문장을 반복 재생할 때 매번 내려받지 않도록).
  const getBuffer = useCallback(async (ctx: AudioContext, url: string): Promise<AudioBuffer> => {
    const cache = bufferCacheRef.current;
    const cached = cache.get(url);
    if (cached) return cached;

    const bytes = await fetch(url).then((r) => {
      if (!r.ok) throw new Error(`오디오 요청 실패: ${r.status}`);
      return r.arrayBuffer();
    });
    const buffer = await ctx.decodeAudioData(bytes);

    if (cache.size >= BUFFER_CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(url, buffer);
    return buffer;
  }, []);

  const stopSource = useCallback((nodes: Nodes) => {
    if (!nodes.source) return;
    try {
      nodes.source.stop();
    } catch {
      // 이미 끝난 소스
    }
    nodes.source.disconnect();
    nodes.source = null;
  }, []);

  const play = useCallback(
    async (url: string, gainValue: number, handlers: PlayHandlers = {}) => {
      const nodes = ensureNodes();
      const request = ++requestRef.current;

      handlersRef.current = handlers;
      const safeGain = Number.isFinite(gainValue) && gainValue > 0 ? gainValue : 1;

      // 이전 재생 정지(경로가 바뀔 수 있으므로 양쪽 다)
      nodes.plain.pause();
      stopSource(nodes);

      // ① 증폭이 필요하면 디코딩 → AudioBufferSource 경로
      if (safeGain > 1 && ensureCtx(nodes)) {
        const ctx = nodes.ctx!;
        if (await tryResume(ctx)) {
          try {
            const buffer = await getBuffer(ctx, url);
            if (request !== requestRef.current) return; // 그 사이 다른 재생·정지가 끼어듦

            nodes.gain!.gain.value = safeGain;
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(nodes.gain!);
            // 정지·교체로 끝난 소스는 콜백을 흘리지 않는다(현재 활성 소스일 때만 알린다).
            source.onended = () => {
              if (nodes.source === source) handlersRef.current.onEnded?.();
            };
            source.start();
            nodes.source = source;
            return;
          } catch (err) {
            console.warn("[Audio] 디코딩 재생 실패 — 보정 없이 재생합니다:", err);
            // 아래 plain 경로로 폴백
          }
        } else {
          // iOS에서 음성 인식 후 컨텍스트가 살아나지 않는 케이스.
          console.warn("[Audio] AudioContext가 running이 아니라 볼륨 보정 없이 재생합니다.");
        }
        if (request !== requestRef.current) return;
      }

      // ② plain 경로 — 증폭 불가, 감쇠만 적용
      const el = nodes.plain;
      el.volume = Math.min(1, safeGain);
      el.muted = false; // 방어: 워밍업 등으로 음소거가 남아 있으면 해제
      el.src = url; // src 대입이 currentTime을 0으로 되돌린다
      el.load();

      await waitUntilReady(el);
      if (request !== requestRef.current) return; // 기다리는 사이 다음 재생이 끼어듦 — 조용히 폐기
      el.currentTime = 0;

      el.play().catch((err) => {
        // 다음 재생이 끼어들어 취소된 경우(AbortError)는 정상 흐름이라 무시한다
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[Audio] 재생 실패:", err);
        handlers.onError?.();
      });
    },
    [ensureNodes, ensureCtx, tryResume, getBuffer, stopSource],
  );

  const stop = useCallback(() => {
    // 순번을 올려 진행 중인 준비 대기·디코딩이 재생을 되살리지 못하게 한다.
    requestRef.current++;
    const nodes = nodesRef.current;
    if (!nodes) return;
    handlersRef.current = {}; // 정지는 onEnded/onError를 발생시키지 않는다
    nodes.plain.pause();
    stopSource(nodes);
  }, [stopSource]);

  // 첫 사용자 입력에서 무음을 짧게 재생해 iOS 오디오 세션을 미리 깨워 둔다.
  useEffect(() => {
    let warmed = false;

    const warmUp = () => {
      if (warmed) return;
      warmed = true;

      const nodes = ensureNodes();
      if (nodes.ctx) void tryResume(nodes.ctx);

      // ⚠️ 재생용 엘리먼트(nodes.plain)를 재사용하면 안 된다 —
      //    "듣기" 탭이 곧 첫 pointerdown이라, 워밍업의 정리 로직이 방금 시작된 진짜 재생을 죽인다.
      const el = new Audio(SILENT_WAV);
      el.muted = true;

      // ⚠️ 정리를 play() 프로미스에만 맡기지 말 것 — 프로미스가 resolve되지 않는 환경(백그라운드 탭 등)에서
      //    그대로 굳는다. 타이머 폴백 필수.
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
      requestRef.current++; // 진행 중인 대기·디코딩 무효화
      const nodes = nodesRef.current;
      if (!nodes) return;
      handlersRef.current = {};
      nodes.plain.onended = null;
      nodes.plain.onerror = null;
      nodes.plain.pause();
      if (nodes.source) {
        try {
          nodes.source.stop();
        } catch {
          // 이미 끝난 소스
        }
        nodes.source = null;
      }
      if (nodes.ctx) {
        nodes.ctx.onstatechange = null;
        void nodes.ctx.close().catch(() => {});
      }
      bufferCacheRef.current.clear();
      nodesRef.current = null;
    };
  }, []);

  return { play, stop };
}
