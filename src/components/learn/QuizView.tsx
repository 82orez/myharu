"use client";

import { useReducer, useCallback, useRef, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Volume2, Mic, MicOff, Eye, X as XIcon, Loader2, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { textsMatch } from "@/lib/normalize-text";
import SessionSummary from "@/components/learn/SessionSummary";
import type { Sentence } from "@/app/(learn)/learn/review/actions";
import type { UserStats, SessionSummary as SessionSummaryType, QuizMode } from "@/types/gamification";

type Phase = "ready" | "question" | "listening" | "result" | "summary";
type Answer = { sentenceId: string; isCorrect: boolean; recognizedText?: string };

type State = {
  phase: Phase;
  currentIndex: number;
  answers: Answer[];
  xpEarned: number;
  currentStreak: number;
  isNewStreakDay: boolean;
  resultStatus: "correct" | "incorrect" | null;
  recognizedText: string;
};

type Action =
  | { type: "START" }
  | { type: "LISTEN" }
  | { type: "SHOW_RESULT"; isCorrect: boolean; recognizedText: string; xp: number; streak: number; isNewStreakDay: boolean }
  | { type: "NEXT" }
  | { type: "RETRY" }
  | { type: "FINISH" }
  | { type: "RESTART" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "START":
      return { ...state, phase: "question", currentIndex: 0, answers: [], xpEarned: 0, currentStreak: 0, isNewStreakDay: false };
    case "LISTEN":
      return { ...state, phase: "listening", resultStatus: null, recognizedText: "" };
    case "SHOW_RESULT":
      return {
        ...state,
        phase: "result",
        resultStatus: action.isCorrect ? "correct" : "incorrect",
        recognizedText: action.recognizedText,
        xpEarned: state.xpEarned + action.xp,
        currentStreak: action.streak,
        isNewStreakDay: state.isNewStreakDay || action.isNewStreakDay,
        answers: [...state.answers, { sentenceId: "", isCorrect: action.isCorrect, recognizedText: action.recognizedText }],
      };
    case "NEXT":
      const nextIndex = state.currentIndex + 1;
      return { ...state, phase: "question", currentIndex: nextIndex, resultStatus: null, recognizedText: "" };
    case "RETRY":
      return { ...state, phase: "question", resultStatus: null, recognizedText: "" };
    case "FINISH":
      return { ...state, phase: "summary" };
    case "RESTART":
      return { ...state, phase: "ready", currentIndex: 0, answers: [], xpEarned: 0, resultStatus: null, recognizedText: "" };
    default:
      return state;
  }
}

const initialState: State = {
  phase: "ready",
  currentIndex: 0,
  answers: [],
  xpEarned: 0,
  currentStreak: 0,
  isNewStreakDay: false,
  resultStatus: null,
  recognizedText: "",
};

export default function QuizView({
  sentences,
  initialStats,
  initialError,
}: {
  sentences: Sentence[];
  initialStats?: UserStats;
  initialError?: string;
}) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [mode, setMode] = useState<QuizMode>("speech");
  const [textInput, setTextInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const recognitionRef = useRef<any>(null);
  const autoAdvanceRef = useRef<NodeJS.Timeout | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSpeechSupported("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  }, []);

  useEffect(() => {
    return () => {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    };
  }, []);

  useEffect(() => {
    setTextInput("");
  }, [state.currentIndex]);

  useEffect(() => {
    if (mode === "text" && state.phase === "question") {
      textInputRef.current?.focus();
    }
  }, [mode, state.phase, state.currentIndex]);

  const currentSentence = sentences[state.currentIndex];
  const progressPercent = sentences.length > 0 ? Math.round((state.currentIndex / sentences.length) * 100) : 0;

  const playAudio = useCallback((audioUrl: string) => {
    const audio = new Audio(audioUrl);
    audio.play().catch((err) => console.error("[Audio] 재생 실패:", err));
  }, []);

  const handleResult = useCallback(
    (isCorrect: boolean, recognizedText: string) => {
      if (!currentSentence) return;

      dispatch({
        type: "SHOW_RESULT",
        isCorrect,
        recognizedText,
        xp: 0,
        streak: 0,
        isNewStreakDay: false,
      });

      if (isCorrect) {
        autoAdvanceRef.current = setTimeout(() => {
          if (state.currentIndex + 1 >= sentences.length) {
            dispatch({ type: "FINISH" });
          } else {
            dispatch({ type: "NEXT" });
          }
        }, 1500);
      }
    },
    [currentSentence, sentences.length, state.currentIndex],
  );

  const handleTextSubmit = useCallback(() => {
    if (!currentSentence) return;
    const trimmed = textInput.trim();
    if (!trimmed) return;
    const { match } = textsMatch(trimmed, currentSentence.english_text);
    handleResult(match, trimmed);
  }, [currentSentence, textInput, handleResult]);

  const startRecognition = useCallback(() => {
    if (!speechSupported || !currentSentence) return;

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    dispatch({ type: "LISTEN" });

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      const { match } = textsMatch(text, currentSentence.english_text);
      handleResult(match, text);
    };

    recognition.onerror = (event: any) => {
      console.error("[Speech Recognition] 오류:", event.error);
      if (event.error === "not-allowed") {
        toast.warning("마이크 접근 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해 주세요.");
      }
      dispatch({ type: "SHOW_RESULT", isCorrect: false, recognizedText: "", xp: 0, streak: state.currentStreak, isNewStreakDay: false });
    };

    recognition.onend = () => {
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [speechSupported, currentSentence, handleResult, state.currentStreak]);

  const handleRevealAnswer = useCallback(() => {
    handleResult(false, "");
  }, [handleResult]);

  const handleNext = useCallback(() => {
    if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    if (state.currentIndex + 1 >= sentences.length) {
      dispatch({ type: "FINISH" });
    } else {
      dispatch({ type: "NEXT" });
    }
  }, [state.currentIndex, sentences.length]);

  // 빈 상태
  if (sentences.length === 0 && !initialError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <p className="text-lg font-medium">퀴즈할 문장이 없습니다</p>
        <p className="text-sm text-muted-foreground">먼저 영어 문장을 입력해 보세요.</p>
        <Button nativeButton={false} variant="brand" render={<Link href="/learn/input" />} className="mt-2 h-12 px-6 text-base font-semibold">
          문장 입력하러 가기
        </Button>
      </div>
    );
  }

  // 에러 상태
  if (initialError) {
    return (
      <p className="py-12 text-center text-sm text-destructive" role="alert">
        {initialError}
      </p>
    );
  }

  // 시작 화면
  if (state.phase === "ready") {
    return (
      <div className="flex flex-col items-center gap-6 py-12 text-center">
        <h1 className="text-3xl font-bold">퀴즈</h1>
        <p className="text-muted-foreground">총 {sentences.length}문장을 연습합니다.</p>

        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-medium text-muted-foreground">학습 모드</p>
          <div className="flex gap-1 rounded-full bg-muted/60 p-1">
            <button
              type="button"
              onClick={() => setMode("speech")}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                mode === "speech" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}>
              <Mic size={14} />
              스피킹
            </button>
            <button
              type="button"
              onClick={() => setMode("text")}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                mode === "text" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}>
              <Keyboard size={14} />
              텍스트
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {mode === "speech" ? "한국어 뜻을 보고 영어로 말하세요" : "한국어 뜻을 보고 영어 문장을 입력하세요"}
          </p>
        </div>

        {mode === "speech" && !speechSupported && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            이 브라우저에서는 음성 인식이 지원되지 않습니다. Chrome 또는 Edge 브라우저를 사용하거나 텍스트 모드를 선택해 주세요.
          </p>
        )}

        <Button
          variant="brand"
          onClick={() => dispatch({ type: "START" })}
          disabled={mode === "speech" && !speechSupported}
          className="mt-4 h-14 px-10 text-lg font-bold">
          시작하기
        </Button>
      </div>
    );
  }

  // 세션 요약
  if (state.phase === "summary") {
    const correctCount = state.answers.filter((a) => a.isCorrect).length;
    const summary: SessionSummaryType = {
      totalQuestions: sentences.length,
      correctCount,
      incorrectCount: sentences.length - correctCount,
      xpEarned: state.xpEarned,
      accuracy: sentences.length > 0 ? Math.round((correctCount / sentences.length) * 100) : 0,
      currentStreak: state.currentStreak,
      isNewStreakDay: state.isNewStreakDay,
    };
    return <SessionSummary summary={summary} onRestart={() => dispatch({ type: "RESTART" })} />;
  }

  // 퀴즈 진행 중
  return (
    <div className="flex flex-col gap-6">
      {/* 상단: 프로그레스 바 + 닫기 */}
      <div className="flex items-center gap-3">
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="ghost" size="icon" aria-label="종료" />}>
            <XIcon className="h-5 w-5" />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>퀴즈 종료</AlertDialogTitle>
              <AlertDialogDescription>진행 중인 퀴즈를 종료하시겠습니까? 현재까지의 기록은 저장됩니다.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>계속하기</AlertDialogCancel>
              <AlertDialogAction onClick={() => router.push("/")}>종료</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Progress value={progressPercent} className="h-3 flex-1" />
        <span className="text-sm font-medium text-muted-foreground">
          {state.currentIndex + 1}/{sentences.length}
        </span>
      </div>

      {/* 문제 카드 */}
      {currentSentence && (
        <Card
          key={state.currentIndex}
          className={`animate-in fade-in slide-in-from-right-4 mx-auto w-full max-w-lg duration-300 ${
            state.resultStatus === "correct" ? "animate-pulse-glow ring-2 ring-success" : state.resultStatus === "incorrect" ? "animate-shake ring-2 ring-destructive" : ""
          }`}>
          <CardContent className="flex min-h-[240px] flex-col items-center justify-center gap-6 py-10 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              {mode === "speech" ? "이 문장을 영어로 말하세요" : "이 문장을 영어로 입력하세요"}
            </p>
            <p className="text-2xl font-bold leading-relaxed">{currentSentence.korean_text}</p>

            {/* 정답 피드백 */}
            {state.resultStatus === "correct" && (
              <div className="animate-in fade-in">
                <p className="text-lg font-semibold text-success">정확합니다!</p>
                <p className="mt-1 text-sm text-muted-foreground">{currentSentence.english_text}</p>
              </div>
            )}

            {state.resultStatus === "incorrect" && (
              <div className="animate-in fade-in flex flex-col gap-2">
                <p className="text-lg font-semibold text-destructive">다시 시도하세요</p>
                <p className="rounded-lg bg-success/10 px-4 py-2 text-sm font-medium text-success">{currentSentence.english_text}</p>
                {state.recognizedText && <p className="text-xs text-muted-foreground">인식된 문장: &quot;{state.recognizedText}&quot;</p>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 액션 버튼 */}
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
        {state.phase === "question" && mode === "speech" && (
          <div className="flex gap-3">
            {currentSentence?.audio_url && (
              <Button variant="outline" onClick={() => playAudio(currentSentence.audio_url)} className="h-12 flex-1 text-base">
                <Volume2 className="mr-2 h-5 w-5" />
                듣기
              </Button>
            )}
            {speechSupported && (
              <Button variant="brand" onClick={startRecognition} className="h-12 flex-1 text-base font-semibold">
                <Mic className="mr-2 h-5 w-5" />
                말하기
              </Button>
            )}
          </div>
        )}

        {state.phase === "question" && mode === "text" && (
          <div className="flex flex-col gap-3">
            {currentSentence?.audio_url && (
              <Button variant="outline" onClick={() => playAudio(currentSentence.audio_url)} className="h-12 text-base">
                <Volume2 className="mr-2 h-5 w-5" />
                듣기
              </Button>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleTextSubmit();
              }}
              className="flex gap-2">
              <Input
                ref={textInputRef}
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="영어 문장을 입력하세요"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                disabled={isPending}
                className="h-12 flex-1 text-base"
              />
              <Button type="submit" variant="brand" disabled={!textInput.trim() || isPending} className="h-12 px-5 text-base font-semibold">
                확인
              </Button>
            </form>
          </div>
        )}

        {state.phase === "question" && (
          <Button variant="ghost" onClick={handleRevealAnswer} className="h-10 text-sm text-muted-foreground">
            <Eye className="mr-1 h-4 w-4" />
            정답 보기
          </Button>
        )}

        {state.phase === "listening" && (
          <Button
            variant="destructive"
            onClick={() => {
              if (recognitionRef.current) recognitionRef.current.abort();
            }}
            className="mx-auto h-14 w-14 rounded-full">
            <MicOff className="h-6 w-6" />
          </Button>
        )}

        {state.phase === "listening" && (
          <p className="text-center text-sm text-muted-foreground" aria-live="polite">
            <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
            듣는 중...
          </p>
        )}

        {state.resultStatus === "incorrect" && (
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                if (mode === "speech") {
                  dispatch({ type: "LISTEN" });
                  setTimeout(startRecognition, 100);
                } else {
                  dispatch({ type: "RETRY" });
                  setTextInput("");
                }
              }}
              className="h-12 flex-1 text-base">
              다시 시도
            </Button>
            <Button variant="brand" onClick={handleNext} className="h-12 flex-1 text-base font-semibold">
              다음
            </Button>
          </div>
        )}

        {state.resultStatus === "correct" && (
          <Button variant="brand" onClick={handleNext} className="h-12 text-base font-semibold">
            다음
          </Button>
        )}
      </div>
    </div>
  );
}
