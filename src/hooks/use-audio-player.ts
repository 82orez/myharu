"use client";

import { useCallback, useEffect, useRef } from "react";

// 문장 오디오 재생 공용 훅 (ReviewClient·QuizView 공유).
//
// 볼륨 균일화: 저장된 측정값으로 계산한 게인(computeGain)을 Web Audio GainNode로 적용한다.
// audio.volume은 0~1이라 증폭이 불가능해 조용한 파일을 끌어올릴 수 없다 → GainNode를 쓴다.
//
// ⚠️ createMediaElementSource는 엘리먼트당 단 한 번만 호출할 수 있다.
//    그래서 재생마다 new Audio()를 만들지 않고, 엘리먼트·AudioContext·GainNode를 각각 하나만
//    만들어 재사용하며 src만 교체한다.
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
  el: HTMLAudioElement;
  ctx: AudioContext | null;
  gain: GainNode | null;
};

export function useAudioPlayer() {
  const nodesRef = useRef<Nodes | null>(null);
  // onEnded/onError는 재생마다 달라지므로 ref에 담고 엘리먼트 핸들러는 한 번만 등록한다.
  const handlersRef = useRef<PlayHandlers>({});

  // 최초 재생(사용자 제스처 안)에서 지연 초기화.
  const ensureNodes = useCallback((): Nodes => {
    if (nodesRef.current) return nodesRef.current;

    const el = new Audio();
    el.crossOrigin = "anonymous"; // ★ src 대입 전에 설정
    el.preload = "auto";
    el.onended = () => handlersRef.current.onEnded?.();
    el.onerror = () => handlersRef.current.onError?.();

    const Ctx: typeof AudioContext | undefined = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) {
      // Web Audio 미지원 브라우저 — 게인 없이 엘리먼트만으로 재생(감쇠만 가능)
      nodesRef.current = { el, ctx: null, gain: null };
      return nodesRef.current;
    }

    const ctx = new Ctx();
    const gain = ctx.createGain();
    ctx.createMediaElementSource(el).connect(gain).connect(ctx.destination);

    nodesRef.current = { el, ctx, gain };
    return nodesRef.current;
  }, []);

  const play = useCallback(
    async (url: string, gainValue: number, handlers: PlayHandlers = {}) => {
      const { el, ctx, gain } = ensureNodes();

      handlersRef.current = handlers;
      const safeGain = Number.isFinite(gainValue) && gainValue > 0 ? gainValue : 1;

      el.pause();

      if (gain) {
        gain.gain.value = safeGain;
      } else {
        el.volume = Math.min(1, safeGain); // 폴백: 증폭 불가, 감쇠만
      }

      // iOS는 사용자 제스처 이후에도 context가 suspended로 시작할 수 있다
      if (ctx && ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          // resume 실패해도 재생은 시도한다
        }
      }

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
    [ensureNodes],
  );

  const stop = useCallback(() => {
    const el = nodesRef.current?.el;
    if (!el) return;
    handlersRef.current = {}; // 정지는 onEnded/onError를 발생시키지 않는다
    el.pause();
  }, []);

  // 언마운트 시 정리 (기존 ReviewClient에는 없던 처리 — 페이지 이탈 후 소리가 남는 것을 막는다)
  useEffect(() => {
    return () => {
      const nodes = nodesRef.current;
      if (!nodes) return;
      handlersRef.current = {};
      nodes.el.onended = null;
      nodes.el.onerror = null;
      nodes.el.pause();
      void nodes.ctx?.close();
      nodesRef.current = null;
    };
  }, []);

  return { play, stop };
}
