"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeClip } from "@/lib/stt-client";

// 말하기 채점용 녹음 → 서버 STT. Web Speech API가 못 미더운 환경(iOS Safari·인앱 브라우저)에서
// 브라우저 인식 엔진을 아예 쓰지 않기 위한 경로다. 판정은 호출 측에서 textsMatch로 한다.

export type RecorderState = "idle" | "recording" | "transcribing";

// 최대 녹음 길이 — 한 문장 말하기용이라 짧게 잡는다(끊기면 그때까지 녹음분으로 인식).
export const RECORD_MAX_MS = 15000;
// 말이 끝난 뒤 이 시간만큼 조용하면 자동 종료(브라우저 인식과 비슷한 감각).
export const RECORD_SILENCE_MS = 1500;

// 무음 판정 RMS(≈ -40dBFS). 이보다 크면 발화로 본다.
const SILENCE_RMS = 0.01;
const POLL_MS = 100;
// 시작 직후 잡음으로 발화가 감지됐다고 오판하지 않도록, 최소 이만큼은 소리가 이어져야 "말했다"로 본다.
const MIN_SPEECH_MS = 300;

type Handlers = {
  onResult: (text: string) => void;
  onError: (message: string) => void;
};

// iOS Safari는 webm을 못 만든다 — 지원 포맷을 실제로 물어보고 확장자도 맞춰 보낸다.
function pickMimeType(): { mime: string; ext: string } {
  if (typeof MediaRecorder === "undefined") return { mime: "", ext: "webm" };
  const candidates: { mime: string; ext: string }[] = [
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/mp4", ext: "mp4" },
    { mime: "audio/mpeg", ext: "mp3" },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mime)) return c;
  }
  return { mime: "", ext: "mp4" }; // 브라우저 기본값에 맡긴다(iOS는 mp4)
}

export function useSpeechRecorder() {
  const [state, setState] = useState<RecorderState>("idle");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const maxRef = useRef<NodeJS.Timeout | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const handlersRef = useRef<Handlers | null>(null);
  const extRef = useRef("webm");
  // 늦게 끝난 요청이 새 녹음·취소 뒤에 결과를 흘리지 않게 하는 순번
  const seqRef = useRef(0);
  const canceledRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (maxRef.current) {
      clearTimeout(maxRef.current);
      maxRef.current = null;
    }
  }, []);

  // 마이크·분석용 컨텍스트를 놓아준다. ⚠️ iOS는 트랙을 stop하지 않으면 오디오 세션을 계속 잡아
  // 다음 재생이 무음이 된다.
  const releaseCapture = useCallback(() => {
    clearTimers();
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (ctxRef.current) {
      void ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
  }, [clearTimers]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    clearTimers();
    if (recorder && recorder.state !== "inactive") {
      recorder.stop(); // onstop에서 전송한다
      return;
    }
    releaseCapture();
    setState("idle");
  }, [clearTimers, releaseCapture]);

  /** 결과를 버리고 즉시 정리(문제 전환·언마운트 등). */
  const cancel = useCallback(() => {
    canceledRef.current = true;
    seqRef.current++;
    handlersRef.current = null;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // 이미 끝난 레코더 — 무시
      }
    }
    releaseCapture();
    setState("idle");
  }, [releaseCapture]);

  const start = useCallback(
    async (handlers: Handlers) => {
      if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        handlers.onError("이 브라우저에서는 녹음을 지원하지 않습니다.");
        return;
      }

      cancel(); // 이전 녹음이 남아 있으면 정리
      canceledRef.current = false;
      handlersRef.current = handlers;
      const seq = ++seqRef.current;
      chunksRef.current = [];

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        handlers.onError("마이크 접근 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해 주세요.");
        return;
      }
      if (seq !== seqRef.current) {
        stream.getTracks().forEach((t) => t.stop()); // 그새 취소됨
        return;
      }
      streamRef.current = stream;

      const { mime, ext } = pickMimeType();
      extRef.current = ext;
      let recorder: MediaRecorder;
      try {
        recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch {
        releaseCapture();
        handlers.onError("이 브라우저에서는 녹음을 지원하지 않습니다.");
        return;
      }
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        releaseCapture();
        const chunks = chunksRef.current;
        chunksRef.current = [];
        if (canceledRef.current || seq !== seqRef.current) {
          setState("idle");
          return;
        }
        const blob = new Blob(chunks, { type: recorder.mimeType || mime || "audio/mp4" });
        if (blob.size === 0) {
          setState("idle");
          handlersRef.current?.onError("녹음된 소리가 없습니다. 다시 시도해 주세요.");
          return;
        }
        setState("transcribing");
        void transcribeClip(blob, `speech.${extRef.current}`).then((result) => {
          if (canceledRef.current || seq !== seqRef.current) return; // 취소·재시작된 뒤 도착
          setState("idle");
          if ("error" in result) {
            handlersRef.current?.onError(result.error);
            return;
          }
          if (!result.text) {
            handlersRef.current?.onError("인식된 문장이 없습니다. 다시 시도해 주세요.");
            return;
          }
          handlersRef.current?.onResult(result.text);
        });
      };

      recorder.start();
      setState("recording");

      // 최대 길이 도달 시 종료
      maxRef.current = setTimeout(() => {
        maxRef.current = null;
        stop();
      }, RECORD_MAX_MS);

      // 무음 자동 종료 — 발화가 한 번 감지된 뒤 RECORD_SILENCE_MS 동안 조용하면 끝낸다.
      try {
        const AudioCtx = window.AudioContext ?? (window as any).webkitAudioContext;
        const ctx: AudioContext = new AudioCtx();
        ctxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const buffer = new Float32Array(analyser.fftSize);

        let speechMs = 0;
        let silenceMs = 0;
        pollRef.current = setInterval(() => {
          analyser.getFloatTimeDomainData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
          const rms = Math.sqrt(sum / buffer.length);

          if (rms > SILENCE_RMS) {
            speechMs += POLL_MS;
            silenceMs = 0;
            return;
          }
          if (speechMs < MIN_SPEECH_MS) return; // 아직 말을 시작하지 않았다 — 계속 기다린다
          silenceMs += POLL_MS;
          if (silenceMs >= RECORD_SILENCE_MS) stop();
        }, POLL_MS);
      } catch {
        // 분석 실패는 치명적이지 않다 — 최대 길이 타이머와 수동 정지 버튼으로 커버된다
      }
    },
    [cancel, releaseCapture, stop],
  );

  useEffect(() => cancel, [cancel]);

  return { state, start, stop, cancel };
}
