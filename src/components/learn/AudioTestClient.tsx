"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Sentence } from "@/app/(learn)/learn/review/actions";

// 임시 진단용 — iOS에서 "듣기" 앞부분이 잘리는 원인을 재생 방식별로 가려낸다.
// 편집 폼 미리듣기(= 방식 D)는 정상이라는 제보가 있어, D와 무엇이 다른지 하나씩 좁히는 구성이다.
// 원인 확정 후 이 파일과 /learn/audio-test 라우트는 삭제한다.

type Variant = {
  id: string;
  label: string;
  desc: string;
};

const VARIANTS: Variant[] = [
  { id: "A", label: "A. 현재 방식", desc: "재사용 Audio 객체 + crossOrigin + src 교체 후 재생 (지금 카드 듣기와 동일)" },
  { id: "B", label: "B. 매번 새 Audio", desc: "재생할 때마다 새 Audio 객체, crossOrigin 없음" },
  { id: "C", label: "C. DOM 오디오 + 코드 재생", desc: "화면에 붙은 <audio>를 코드로 play()" },
  { id: "D", label: "D. DOM 오디오 + 직접 탭", desc: "아래 재생바를 직접 누름 (편집 미리듣기와 동일)" },
  { id: "E", label: "E. Web Audio 디코딩 재생", desc: "파일을 통째로 디코딩해 AudioBufferSource로 재생" },
];

export default function AudioTestClient({ sentences }: { sentences: Sentence[] }) {
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<string>("");
  const reusedRef = useRef<HTMLAudioElement | null>(null);
  const domAudioRef = useRef<HTMLAudioElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<Map<string, AudioBuffer>>(new Map());

  const sentence = sentences[index];

  useEffect(() => {
    return () => {
      reusedRef.current?.pause();
      sourceRef.current?.stop();
      void ctxRef.current?.close().catch(() => {});
    };
  }, []);

  function stopAll() {
    reusedRef.current?.pause();
    domAudioRef.current?.pause();
    try {
      sourceRef.current?.stop();
    } catch {
      // 이미 정지
    }
    sourceRef.current = null;
  }

  async function run(variant: string) {
    if (!sentence) return;
    stopAll();
    setStatus(`${variant} 재생 중...`);
    const url = sentence.audio_url;

    try {
      if (variant === "A") {
        if (!reusedRef.current) {
          const el = new Audio();
          el.crossOrigin = "anonymous";
          el.preload = "auto";
          reusedRef.current = el;
        }
        const el = reusedRef.current;
        el.src = url;
        el.load();
        await el.play();
      } else if (variant === "B") {
        const el = new Audio(url);
        el.preload = "auto";
        await el.play();
      } else if (variant === "C") {
        const el = domAudioRef.current;
        if (!el) return;
        el.currentTime = 0;
        await el.play();
      } else if (variant === "E") {
        const ctx = (ctxRef.current ??= new (window.AudioContext || (window as any).webkitAudioContext)());
        if (ctx.state !== "running") await ctx.resume().catch(() => {});
        let buffer = bufferRef.current.get(url);
        if (!buffer) {
          const bytes = await fetch(url).then((r) => r.arrayBuffer());
          buffer = await ctx.decodeAudioData(bytes);
          bufferRef.current.set(url, buffer);
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start();
        sourceRef.current = source;
      }
      setStatus(`${variant} 재생함 — 첫 단어가 들렸나요?`);
    } catch (err) {
      setStatus(`${variant} 실패: ${String(err).slice(0, 80)}`);
    }
  }

  if (!sentence) return <p className="text-muted-foreground text-sm">문장이 없습니다.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="text-muted-foreground text-xs">테스트할 문장</label>
        <select
          value={index}
          onChange={(e) => {
            stopAll();
            setIndex(Number(e.target.value));
            setStatus("");
          }}
          className="border-input bg-background h-10 rounded-md border px-3 text-sm"
        >
          {sentences.map((s, i) => (
            <option key={s.id} value={i}>
              {s.korean_text.slice(0, 30)}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">{sentence.english_text}</p>
      </div>

      {VARIANTS.filter((v) => v.id !== "D").map((v) => (
        <Card key={v.id}>
          <CardContent className="flex flex-col gap-2">
            <Button variant="outline" onClick={() => run(v.id)} className="h-12 rounded-xl font-bold">
              {v.label}
            </Button>
            <p className="text-muted-foreground text-xs">{v.desc}</p>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm font-bold">D. DOM 오디오 + 직접 탭</p>
          {/* C와 같은 엘리먼트 — 직접 탭(D)과 코드 재생(C)의 차이를 본다 */}
          <audio ref={domAudioRef} src={sentence.audio_url} controls preload="auto" className="w-full" />
          <p className="text-muted-foreground text-xs">{VARIANTS[3].desc}</p>
        </CardContent>
      </Card>

      {status && <p className="text-brand text-sm">{status}</p>}
    </div>
  );
}
