"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, PenLine } from "lucide-react";
import { createSentence, type InputState } from "@/app/(learn)/learn/input/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_LENGTH = 500;
const WARN_THRESHOLD = 450;

export default function InputForm() {
  const [state, formAction, pending] = useActionState<InputState, FormData>(createSentence, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [englishText, setEnglishText] = useState("");
  const [koreanText, setKoreanText] = useState("");
  const [recentSave, setRecentSave] = useState<{ english: string; korean: string } | null>(null);

  useEffect(() => {
    if (state?.success) {
      setRecentSave({ english: englishText, korean: koreanText });
      setEnglishText("");
      setKoreanText("");
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-brand">
            <PenLine size={16} />
          </div>
          <CardTitle className="text-2xl font-extrabold">문장 입력</CardTitle>
        </div>
        <CardDescription>영어 문장과 한국어 뜻을 입력하세요</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="englishText">영어 문장</Label>
            <textarea
              id="englishText"
              name="englishText"
              required
              placeholder="Hello, how are you today?"
              value={englishText}
              onChange={(e) => setEnglishText(e.target.value)}
              aria-invalid={!!state?.error}
              aria-describedby={state?.error ? "input-error" : undefined}
              className="border-input bg-background ring-ring/10 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/20 flex min-h-[80px] w-full rounded-md border px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
              maxLength={MAX_LENGTH}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">예시: I&apos;m really glad to see you again after such a long time.</p>
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
              className="h-10"
              maxLength={MAX_LENGTH}
            />
            <div className="flex justify-end">
              <span className={`text-xs ${koreanText.length > WARN_THRESHOLD ? "text-destructive" : "text-muted-foreground"}`}>
                {koreanText.length}/{MAX_LENGTH}
              </span>
            </div>
          </div>

          {state?.error && (
            <p id="input-error" className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
          {state?.success && (
            <p className="animate-in fade-in slide-in-from-bottom-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700" role="status">
              {state.success}
            </p>
          )}

          <Button type="submit" disabled={pending} variant="brand" className="mt-2 h-12 rounded-xl text-lg font-bold">
            {pending && <Loader2 className="animate-spin" />}
            {pending ? "저장 중..." : "저장"}
          </Button>
        </form>

        {recentSave && (
          <div className="animate-in fade-in slide-in-from-bottom-2 mt-4 rounded-md border border-border bg-muted/40 px-3 py-2">
            <p className="mb-1 text-xs font-medium text-muted-foreground">최근 저장</p>
            <p className="text-sm">{recentSave.english}</p>
            <p className="text-xs text-muted-foreground">{recentSave.korean}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
