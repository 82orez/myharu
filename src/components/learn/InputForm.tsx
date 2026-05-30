"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, PenLine, Volume2, RotateCcw } from "lucide-react";
import { generateAudio, saveSentence } from "@/app/(learn)/learn/input/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import TagPicker from "@/components/learn/TagPicker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const MAX_LENGTH = 500;
const WARN_THRESHOLD = 450;

type Phase = "input" | "preview" | "saving";

export default function InputForm({ initialPresets = [] }: { initialPresets?: string[] }) {
  const [englishText, setEnglishText] = useState("");
  const [koreanText, setKoreanText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [presets, setPresets] = useState<string[]>(initialPresets);
  const [phase, setPhase] = useState<Phase>("input");
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [recentSave, setRecentSave] = useState<{ english: string; korean: string } | null>(null);
  const [generating, startGenerating] = useTransition();
  const [saving, startSaving] = useTransition();
  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  function base64ToBlobUrl(base64: string): string {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "audio/mpeg" });
    return URL.createObjectURL(blob);
  }

  function handleGenerate() {
    if (!englishText.trim() || !koreanText.trim()) {
      setError("영어 문장과 한국어 뜻을 모두 입력해 주세요.");
      return;
    }

    setError(null);
    setSuccess(null);

    startGenerating(async () => {
      const result = await generateAudio(englishText);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const url = base64ToBlobUrl(result.audioBase64);
      setAudioBase64(result.audioBase64);
      setAudioUrl(url);
      setPhase("preview");
    });
  }

  function handleRegenerate() {
    setError(null);

    startGenerating(async () => {
      const result = await generateAudio(englishText);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const url = base64ToBlobUrl(result.audioBase64);
      setAudioBase64(result.audioBase64);
      setAudioUrl(url);
    });
  }

  function handleSave() {
    if (!audioBase64) return;

    setError(null);

    startSaving(async () => {
      const result = await saveSentence(englishText, koreanText, audioBase64, tags);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      setSuccess(result.success);
      setRecentSave({ english: englishText, korean: koreanText });
      setEnglishText("");
      setKoreanText("");
      setTags([]);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioBase64(null);
      setAudioUrl(null);
      setPhase("input");
    });
  }

  function handleReset() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBase64(null);
    setAudioUrl(null);
    setError(null);
    setSuccess(null);
    setPhase("input");
  }

  const isPreview = phase === "preview";
  const pending = generating || saving;

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="bg-brand/10 text-brand flex h-8 w-8 items-center justify-center rounded-full">
            <PenLine size={16} />
          </div>
          <CardTitle className="text-2xl font-extrabold">문장 입력</CardTitle>
        </div>
        <CardDescription>영어 문장과 한국어 뜻을 입력하세요</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="englishText">영어 문장</Label>
            <textarea
              id="englishText"
              name="englishText"
              required
              placeholder="Hello, how are you today?"
              value={englishText}
              onChange={(e) => setEnglishText(e.target.value)}
              readOnly={isPreview}
              aria-invalid={!!error}
              aria-describedby={error ? "input-error" : undefined}
              className="border-input bg-background ring-ring/10 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/20 read-only:bg-muted/50 flex min-h-[80px] w-full rounded-md border px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
              maxLength={MAX_LENGTH}
            />
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs">예시: I&apos;m really glad to see you again after such a long time.</p>
              <span className={`text-xs ${englishText.length > WARN_THRESHOLD ? "text-destructive" : "text-muted-foreground"}`}>
                {englishText.length}/{MAX_LENGTH}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="koreanText">한국어 뜻</Label>
            <Input
              id="koreanText"
              name="koreanText"
              type="text"
              required
              placeholder="안녕하세요, 오늘 어떠세요?"
              value={koreanText}
              onChange={(e) => setKoreanText(e.target.value)}
              readOnly={isPreview}
              className="read-only:bg-muted/50 h-10"
              maxLength={MAX_LENGTH}
            />
            <div className="flex justify-end">
              <span className={`text-xs ${koreanText.length > WARN_THRESHOLD ? "text-destructive" : "text-muted-foreground"}`}>
                {koreanText.length}/{MAX_LENGTH}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="tags">Tag (Optional)</Label>
            <TagPicker value={tags} onChange={setTags} presets={presets} onPresetsChange={setPresets} disabled={pending} />
          </div>

          {isPreview && audioUrl && (
            <div className="animate-in fade-in slide-in-from-bottom-2 border-brand/20 bg-brand/5 flex flex-col gap-3 rounded-xl border p-4">
              <div className="text-brand flex items-center gap-2 text-sm font-medium">
                <Volume2 size={16} />
                음성 미리듣기
              </div>
              <audio ref={audioRef} src={audioUrl} controls className="w-full" />
            </div>
          )}

          {error && (
            <p id="input-error" className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="animate-in fade-in slide-in-from-bottom-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700" role="status">
              {success}
            </p>
          )}

          {!isPreview ? (
            <Button type="button" onClick={handleGenerate} disabled={pending} variant="brand" className="mt-2 h-12 rounded-xl text-lg font-bold">
              {generating && <Loader2 className="animate-spin" />}
              {generating ? "음성 생성 중" : "AI 음성 생성"}
            </Button>
          ) : (
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                onClick={() => setRegenConfirmOpen(true)}
                disabled={pending}
                variant="outline"
                className="h-12 flex-1 rounded-xl font-bold">
                {generating && <Loader2 className="animate-spin" />}
                {generating ? (
                  "생성 중"
                ) : (
                  <>
                    <RotateCcw size={16} /> 다시 생성
                  </>
                )}
              </Button>
              <Button type="button" onClick={handleSave} disabled={pending} variant="brand" className="h-12 flex-1 rounded-xl text-lg font-bold">
                {saving && <Loader2 className="animate-spin" />}
                {saving ? "저장 중..." : "저장"}
              </Button>
            </div>
          )}

          <AlertDialog open={regenConfirmOpen} onOpenChange={setRegenConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>음성을 다시 생성할까요?</AlertDialogTitle>
                <AlertDialogDescription>현재 미리듣기 음성이 새 음성으로 교체됩니다.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction
                  variant="brand"
                  onClick={() => {
                    setRegenConfirmOpen(false);
                    handleRegenerate();
                  }}>
                  다시 생성
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {isPreview && (
            <button
              type="button"
              onClick={handleReset}
              disabled={pending}
              className="text-muted-foreground text-sm underline-offset-4 hover:underline">
              처음부터 다시 입력
            </button>
          )}
        </div>

        {recentSave && (
          <div className="animate-in fade-in slide-in-from-bottom-2 border-border bg-muted/40 mt-4 rounded-md border px-3 py-2">
            <p className="text-muted-foreground mb-1 text-xs font-medium">최근 저장</p>
            <p className="text-sm">{recentSave.english}</p>
            <p className="text-muted-foreground text-xs">{recentSave.korean}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
