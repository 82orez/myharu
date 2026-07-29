"use client";

import { useReducer, useCallback, useRef, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Volume2, Mic, MicOff, Eye, X as XIcon, Loader2, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { textsMatch, SIMILARITY_THRESHOLD, STRICT_SIMILARITY_THRESHOLD } from "@/lib/normalize-text";
import { computeGain } from "@/lib/audio-loudness";
import { installFeedbackSoundUnlock, playFeedbackSound, primeFeedbackSounds } from "@/lib/feedback-sound";
import {
  getSpeechAvailability,
  unavailableKind,
  rememberUnavailable,
  forgetUnavailable,
  speechUnavailableMessage,
  SPEECH_START_TIMEOUT_MS,
  type SpeechAvailability,
} from "@/lib/speech-recognition";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import SessionSummary from "@/components/learn/SessionSummary";
import { incrementPracticeCount } from "@/app/(learn)/learn/review/gamification-actions";
import type { Sentence } from "@/app/(learn)/learn/review/actions";
import type { UserStats, SessionSummary as SessionSummaryType, QuizMode } from "@/types/gamification";

type Phase = "ready" | "question" | "listening" | "result" | "summary";
type Answer = { sentenceId: string; isCorrect: boolean; recognizedText?: string };

type State = {
  phase: Phase;
  currentIndex: number;
  answers: Answer[];
  resultStatus: "correct" | "incorrect" | null;
  recognizedText: string;
};

type Action =
  | { type: "START" }
  | { type: "LISTEN" }
  | { type: "SHOW_RESULT"; sentenceId: string; isCorrect: boolean; recognizedText: string }
  | { type: "NEXT" }
  | { type: "RETRY" }
  | { type: "FINISH" }
  | { type: "RESTART" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "START":
      return { ...state, phase: "question", currentIndex: 0, answers: [] };
    case "LISTEN":
      return { ...state, phase: "listening", resultStatus: null, recognizedText: "" };
    case "SHOW_RESULT": {
      // 문제당 항목 하나만 유지 — 재시도 시 같은 인덱스를 덮어써 중복 방지
      const answers = [...state.answers];
      answers[state.currentIndex] = { sentenceId: action.sentenceId, isCorrect: action.isCorrect, recognizedText: action.recognizedText };
      return {
        ...state,
        phase: "result",
        resultStatus: action.isCorrect ? "correct" : "incorrect",
        recognizedText: action.recognizedText,
        answers,
      };
    }
    case "NEXT":
      const nextIndex = state.currentIndex + 1;
      return { ...state, phase: "question", currentIndex: nextIndex, resultStatus: null, recognizedText: "" };
    case "RETRY":
      return { ...state, phase: "question", resultStatus: null, recognizedText: "" };
    case "FINISH":
      return { ...state, phase: "summary" };
    case "RESTART":
      return { ...state, phase: "ready", currentIndex: 0, answers: [], resultStatus: null, recognizedText: "" };
    default:
      return state;
  }
}

const initialState: State = {
  phase: "ready",
  currentIndex: 0,
  answers: [],
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
  // null = 아직 판정 전(SSR/첫 렌더) — 안내 문구가 깜빡이지 않도록 구분한다.
  const [speechAvailability, setSpeechAvailability] = useState<SpeechAvailability | null>(null);
  const speechSupported = speechAvailability === "available";
  const [quizType, setQuizType] = useState<"translate" | "listening">("translate");
  const [mode, setMode] = useState<QuizMode>("speech");
  const [writingActive, setWritingActive] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPending, startTransition] = useTransition();
  const recognitionRef = useRef<any>(null);
  const startWatchdogRef = useRef<NodeJS.Timeout | null>(null);
  const { play, stop: stopAudio } = useAudioPlayer();
  const textInputRef = useRef<HTMLInputElement>(null);

  const clearStartWatchdog = useCallback(() => {
    if (startWatchdogRef.current) {
      clearTimeout(startWatchdogRef.current);
      startWatchdogRef.current = null;
    }
  }, []);

  // 수음이 실제로 시작됨 — 워치독 해제 + 과거 실패 기록 폐기
  const handleSpeechStarted = useCallback(() => {
    clearStartWatchdog();
    forgetUnavailable();
  }, [clearStartWatchdog]);

  useEffect(() => {
    setSpeechAvailability(getSpeechAvailability());
    return () => {
      if (startWatchdogRef.current) clearTimeout(startWatchdogRef.current);
    };
  }, []);

  // iOS: 첫 사용자 입력에서 알림음 엘리먼트 잠금 해제 (제스처 밖에서 울리는 채점음 대비)
  useEffect(() => installFeedbackSoundUnlock(), []);

  useEffect(() => {
    setTextInput("");
    setWritingActive(false);
    stopAudio();
    setIsPlaying(false);
  }, [state.currentIndex, stopAudio]);

  useEffect(() => {
    if (writingActive && state.phase === "question") {
      textInputRef.current?.focus();
    }
  }, [writingActive, state.phase, state.currentIndex]);

  const currentSentence = sentences[state.currentIndex];
  const progressPercent = sentences.length > 0 ? Math.round(((state.currentIndex + 1) / sentences.length) * 100) : 0;
  const speechThreshold = initialStats?.speech_strict ? STRICT_SIMILARITY_THRESHOLD : SIMILARITY_THRESHOLD;

  // 볼륨 균일화: 저장된 측정값으로 계산한 게인을 적용해 재생한다(미측정 문장은 게인 1.0).
  const playAudio = useCallback(
    (sentence: Sentence) => {
      // iOS는 음성 인식이 마이크를 잡고 있으면 오디오 세션이 녹음 상태라 재생이 무음이 된다.
      // onend가 이미 지나갔더라도 남아 있는 인식 객체를 확실히 끊고 재생한다.
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      setIsPlaying(true);
      void play(sentence.audio_url, computeGain(sentence.loudness_db, sentence.peak_db), {
        onEnded: () => setIsPlaying(false),
        onError: () => setIsPlaying(false),
      });
    },
    [play],
  );

  const handleResult = useCallback(
    (isCorrect: boolean, recognizedText: string) => {
      if (!currentSentence) return;

      playFeedbackSound(isCorrect ? "correct" : "incorrect");
      dispatch({
        type: "SHOW_RESULT",
        sentenceId: currentSentence.id,
        isCorrect,
        recognizedText,
      });
    },
    [currentSentence],
  );

  const handleTextSubmit = useCallback(() => {
    if (!currentSentence) return;
    const trimmed = textInput.trim();
    if (!trimmed) return;
    const { match } = textsMatch(trimmed, currentSentence.english_text);
    // 정답일 때만 모드별 정답 횟수 누적(문장 목록에 표시)
    if (match) void incrementPracticeCount(currentSentence.id, "text");
    handleResult(match, trimmed);
  }, [currentSentence, textInput, handleResult]);

  const startRecognition = useCallback(() => {
    if (!speechSupported || !currentSentence) return;

    // 채점음은 인식 콜백(제스처 밖)에서 울린다 — 버튼을 누른 지금(제스처 안) 잠금을 풀어 둔다.
    primeFeedbackSounds();

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
      const { match, similarity } = textsMatch(text, currentSentence.english_text, speechThreshold);
      console.log("[스피킹 인식]", { 인식: text, 정답: currentSentence.english_text, 유사도: similarity, 정답여부: match });
      // 정답일 때만 모드별 정답 횟수 누적(문장 목록에 표시)
      if (match) void incrementPracticeCount(currentSentence.id, "speech");
      handleResult(match, text);
    };

    // 실제로 수음이 시작됐다는 신호 — 워치독 해제
    recognition.onstart = handleSpeechStarted;
    recognition.onaudiostart = handleSpeechStarted;

    recognition.onerror = (event: any) => {
      clearStartWatchdog();
      // "aborted"(사용자가 중지)·"no-speech"(무음)는 정상/무해 케이스라 로깅 제외
      if (event.error !== "aborted" && event.error !== "no-speech") {
        console.error("[Speech Recognition] 오류:", event.error);
      }
      if (event.error === "not-allowed") {
        toast.warning("마이크 접근 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해 주세요.");
      }
      // 인식 서비스 자체를 쓸 수 없는 환경: 오답 처리하지 않고 복귀
      if (event.error === "service-not-allowed" || event.error === "language-not-supported") {
        const availability = unavailableKind();
        rememberUnavailable(availability);
        setSpeechAvailability(availability);
        dispatch({ type: "RETRY" });
        return;
      }
      // 사용자가 중지 버튼을 누른 경우: 오답 처리하지 않고 질문 화면으로 복귀
      if (event.error === "aborted") {
        dispatch({ type: "RETRY" });
        return;
      }
      dispatch({ type: "SHOW_RESULT", sentenceId: currentSentence.id, isCorrect: false, recognizedText: "" });
    };

    recognition.onend = () => {
      clearStartWatchdog();
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();

    // 가용성 판정은 여기서만 한다(UA 사전 차단 없음).
    // 동작하지 않는 환경은 start()가 마이크 권한만 요청하고 어떤 이벤트도 발생시키지 않는다.
    clearStartWatchdog();
    startWatchdogRef.current = setTimeout(() => {
      startWatchdogRef.current = null;
      if (recognitionRef.current !== recognition) return; // 이미 종료·교체됨
      recognition.abort();
      recognitionRef.current = null;
      const availability = unavailableKind();
      rememberUnavailable(availability);
      setSpeechAvailability(availability);
      toast.warning(speechUnavailableMessage(availability));
      dispatch({ type: "RETRY" }); // 오답 처리하지 않고 질문 화면으로 복귀
    }, SPEECH_START_TIMEOUT_MS);
  }, [speechSupported, currentSentence, handleResult, speechThreshold, clearStartWatchdog, handleSpeechStarted]);

  const handleRevealAnswer = useCallback(() => {
    handleResult(false, "");
  }, [handleResult]);

  const handleNext = useCallback(() => {
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
        <p className="text-muted-foreground text-sm">먼저 영어 문장을 입력해 보세요.</p>
        <Button nativeButton={false} variant="brand" render={<Link href="/learn/input" />} className="mt-2 h-12 px-6 text-base font-semibold">
          문장 입력하러 가기
        </Button>
      </div>
    );
  }

  // 에러 상태
  if (initialError) {
    return (
      <p className="text-destructive py-12 text-center text-sm" role="alert">
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

        <div className="flex w-full max-w-md flex-col gap-3">
          <Button
            variant={quizType === "translate" ? "brand" : "outline"}
            onClick={() => setQuizType("translate")}
            className="h-auto flex-col items-start gap-1 px-5 py-4 text-left"
          >
            <span className="text-base font-bold">일반 (한국어 → 영어)</span>
            <span className="text-sm font-normal opacity-80">한국어 뜻을 보고 영어로 말하거나 써요.</span>
          </Button>
          {/* 리스닝은 말하기 전용이라 음성 인식이 안 되는 환경(iOS 비-Safari 등)에서는 선택할 수 없다 */}
          <Button
            variant={quizType === "listening" ? "brand" : "outline"}
            disabled={speechAvailability !== null && !speechSupported}
            onClick={() => setQuizType("listening")}
            className="h-auto flex-col items-start gap-1 px-5 py-4 text-left"
          >
            <span className="text-base font-bold">리스닝 (듣고 따라 말하기)</span>
            <span className="text-sm font-normal opacity-80">오디오를 듣고 영어 문장을 따라 말해요.</span>
          </Button>
        </div>

        {speechAvailability !== null && !speechSupported && (
          <p className="text-muted-foreground max-w-md text-sm">{speechUnavailableMessage(speechAvailability)}</p>
        )}

        <Button variant="brand" onClick={() => dispatch({ type: "START" })} className="mt-2 h-14 px-10 text-lg font-bold">
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
      accuracy: sentences.length > 0 ? Math.round((correctCount / sentences.length) * 100) : 0,
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

        <Progress value={progressPercent} className="h-3 flex-1 items-center [&_[data-slot=progress-track]]:h-3" />
        <span className="text-muted-foreground text-sm font-medium">
          {state.currentIndex + 1}/{sentences.length}
        </span>
      </div>

      {/* 문제 카드 */}
      {currentSentence &&
        (() => {
          const listenClickable = quizType === "listening" && !!currentSentence.audio_url && state.phase !== "listening" && !isPlaying;
          return (
            <Card
              key={state.currentIndex}
              onClick={listenClickable ? () => playAudio(currentSentence) : undefined}
              role={listenClickable ? "button" : undefined}
              aria-label={listenClickable ? "오디오 듣기" : undefined}
              className={`animate-in fade-in slide-in-from-right-4 mx-auto w-full max-w-lg duration-300 ${
                listenClickable ? "hover:border-brand/50 cursor-pointer transition-colors" : ""
              } ${
                state.resultStatus === "correct"
                  ? "animate-pulse-glow ring-success ring-2"
                  : state.resultStatus === "incorrect"
                    ? "animate-shake ring-destructive ring-2"
                    : ""
              }`}
            >
              <CardContent className="flex min-h-[240px] flex-col items-center justify-center gap-6 py-10 text-center">
                {quizType === "listening" ? (
                  <>
                    <p className="text-muted-foreground text-sm font-medium">{isPlaying ? "재생 중..." : "카드를 눌러 듣고 따라 말해 보세요"}</p>
                    {isPlaying ? <Loader2 className="text-brand h-12 w-12 animate-spin" /> : <Volume2 className="text-brand h-12 w-12" />}
                  </>
                ) : (
                  <>
                    <p className="text-muted-foreground text-sm font-medium">이 문장을 영어로 말하거나 입력하세요</p>
                    <p className="text-2xl leading-relaxed font-bold">{currentSentence.korean_text}</p>
                  </>
                )}

                {/* 정답 피드백 */}
                {state.resultStatus === "correct" && (
                  <div className="animate-in fade-in">
                    <p className="text-success text-lg font-semibold">정확합니다!</p>
                    <p className="text-muted-foreground mt-1 text-sm">{currentSentence.english_text}</p>
                    {quizType === "listening" && <p className="text-muted-foreground text-sm font-medium">{currentSentence.korean_text}</p>}
                  </div>
                )}

                {state.resultStatus === "incorrect" && (
                  <div className="animate-in fade-in flex flex-col gap-2">
                    <p className="text-destructive text-lg font-semibold">다시 시도하세요</p>
                    <p className="bg-success/10 text-success rounded-lg px-4 py-2 text-sm font-medium">{currentSentence.english_text}</p>
                    {quizType === "listening" && <p className="text-muted-foreground text-sm font-medium">{currentSentence.korean_text}</p>}
                    {state.recognizedText && <p className="text-muted-foreground text-xs">인식된 문장: &quot;{state.recognizedText}&quot;</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

      {/* 액션 버튼 */}
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
        {state.phase === "question" && (
          <div className="flex flex-col gap-3">
            {quizType === "translate" && currentSentence?.audio_url && (
              <Button variant="outline" disabled={isPlaying} onClick={() => playAudio(currentSentence)} className="h-12 text-base">
                {isPlaying ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Volume2 className="mr-2 h-5 w-5" />}
                {isPlaying ? "playing" : "듣기"}
              </Button>
            )}

            {/* 말하기 / 쓰기 선택 (리스닝 모드는 말하기만) */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                disabled={!speechSupported || isPlaying}
                onClick={() => {
                  setWritingActive(false);
                  setMode("speech");
                  startRecognition();
                }}
                className="h-12 flex-1 text-base font-semibold"
              >
                <Mic className="mr-2 h-5 w-5" />
                말하기
              </Button>
              {quizType === "translate" && (
                <Button
                  variant={writingActive ? "destructive" : "outline"}
                  disabled={isPlaying}
                  onClick={() => {
                    if (writingActive) {
                      setWritingActive(false);
                      setTextInput("");
                    } else {
                      setMode("text");
                      setWritingActive(true);
                    }
                  }}
                  className="h-12 flex-1 text-base font-semibold"
                >
                  <Keyboard className="mr-2 h-5 w-5" />
                  {writingActive ? "닫기" : "쓰기"}
                </Button>
              )}
            </div>

            {speechAvailability !== null && speechAvailability !== "available" && (
              <p className="text-muted-foreground text-center text-xs">
                {speechUnavailableMessage(speechAvailability)}
                {quizType === "translate" ? " 쓰기로 연습해 주세요." : ""}
              </p>
            )}

            {quizType === "translate" && writingActive && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleTextSubmit();
                }}
                className="flex gap-2"
              >
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
                  disabled={isPending || isPlaying}
                  className="h-12 flex-1 text-base"
                />
                <Button
                  type="submit"
                  variant="brand"
                  disabled={!textInput.trim() || isPending || isPlaying}
                  className="h-12 px-5 text-base font-semibold"
                >
                  확인
                </Button>
              </form>
            )}
          </div>
        )}

        {state.phase === "question" && (
          <Button variant="ghost" disabled={isPlaying} onClick={handleRevealAnswer} className="text-muted-foreground h-10 text-sm">
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
            className="mx-auto h-14 w-14 rounded-full"
          >
            <MicOff className="h-6 w-6" />
          </Button>
        )}

        {state.phase === "listening" && (
          <p className="text-muted-foreground text-center text-sm" aria-live="polite">
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
              className="h-12 flex-1 text-base"
            >
              다시 시도
            </Button>
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="brand" className="h-12 flex-1 text-base font-semibold" />}>다음</AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>다음 문제로 이동</AlertDialogTitle>
                  <AlertDialogDescription>정말로 다음으로 넘어가시겠습니까? 다음으로 넘어가면 오답 처리됩니다.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction onClick={handleNext}>다음</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
