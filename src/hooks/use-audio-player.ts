"use client";

import { useCallback, useEffect, useRef } from "react";

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

export function useAudioPlayer() {
  const nodesRef = useRef<Nodes | null>(null);
  const activeRef = useRef<HTMLAudioElement | null>(null);
  // onEnded/onError는 재생마다 달라지므로 ref에 담고 엘리먼트 핸들러는 한 번만 등록한다.
  const handlersRef = useRef<PlayHandlers>({});

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
  const ensureBoosted = useCallback((nodes: Nodes): boolean => {
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
  }, [createElement]);

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
      el.src = url; // src 대입이 currentTime을 0으로 되돌린다

      try {
        await el.play();
      } catch (err) {
        // 다음 재생이 끼어들어 취소된 경우(AbortError)는 정상 흐름이라 무시한다
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[Audio] 재생 실패:", err);
        handlers.onError?.();
      }
    },
    [ensureNodes, ensureBoosted, tryResume],
  );

  const stop = useCallback(() => {
    const nodes = nodesRef.current;
    if (!nodes) return;
    handlersRef.current = {}; // 정지는 onEnded/onError를 발생시키지 않는다
    nodes.plain.pause();
    nodes.boosted?.pause();
    activeRef.current = null;
  }, []);

  // 언마운트 시 정리 (페이지 이탈 후 소리가 남는 것을 막는다)
  useEffect(() => {
    return () => {
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
