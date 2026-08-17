"use client";

import { useReducer, useCallback, useRef, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Volume2, Mic, MicOff, Eye, EyeOff, X as XIcon, Loader2, Keyboard, Star, SkipForward } from "lucide-react";
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
import { buildSentenceNumbers } from "@/lib/sentence-number";
import { installFeedbackSoundUnlock, playFeedbackSound, primeFeedbackSounds } from "@/lib/feedback-sound";
import { getAutoPlayDelay } from "@/lib/quiz-autoplay";
import {
  getSpeechAvailability,
  unavailableKind,
  rememberUnavailable,
  forgetUnavailable,
  speechUnavailableMessage,
  SPEECH_START_TIMEOUT_MS,
  SPEECH_SESSION_TIMEOUT_MS,
  MAX_SPEECH_ALTERNATIVES,
  pickBestAlternative,
  type SpeechAvailability,
} from "@/lib/speech-recognition";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import SessionSummary from "@/components/learn/SessionSummary";
import QuizFilterPanel from "@/components/learn/QuizFilterPanel";
import { EMPTY_FILTER, filterSentences, orderSentences, parseNumberRanges, type QuizOrder, type SentenceFilter } from "@/lib/sentence-filter";
import { incrementPracticeCount } from "@/app/(learn)/learn/review/gamification-actions";
import { toggleFavorite, type Sentence } from "@/app/(learn)/learn/review/actions";
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
  | { type: "ACCEPT" }
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
    case "ACCEPT": {
      // 음성 인식 오탐 등을 고려해, 오답 결과에서 넘어갈 때 그 문제를 정답으로 인정한다.
      const answers = [...state.answers];
      const prev = answers[state.currentIndex];
      if (!prev) return state;
      answers[state.currentIndex] = { ...prev, isCorrect: true };
      return { ...state, answers };
    }
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

// 마지막 출제 조건(기기별 설정 — DB에 저장하지 않는다)
const QUIZ_FILTER_KEY = "myharu:quiz-filter";

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
  // 기본은 리스닝 — 음성 인식 불가 판정이 나면 아래 이펙트가 일반 모드로 되돌린다
  const [quizType, setQuizType] = useState<"translate" | "listening">("listening");
  // 출제 범위(시작 화면 필터). 세션에 쓰이는 문장은 START에서 sessionSentences로 스냅샷한다.
  const [filter, setFilter] = useState<SentenceFilter>(EMPTY_FILTER);
  const [numberInput, setNumberInput] = useState(""); // 순번 원문("1-20, 35")
  const [order, setOrder] = useState<QuizOrder>("number");
  const [limit, setLimit] = useState(0); // 0 = 전체
  const [filterOpen, setFilterOpen] = useState(false);
  const [sessionSentences, setSessionSentences] = useState<Sentence[]>(sentences);
  const [mode, setMode] = useState<QuizMode>("speech");
  const [writingActive, setWritingActive] = useState(false);
  // 카드 안에 정답을 띄운 상태(정답을 보며 말하기 위함) — 문제가 바뀌면 자동 해제
  const [answerShown, setAnswerShown] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  // 리스닝 자동 재생까지 남은 초(null = 대기 중 아님)
  const [autoPlayCountdown, setAutoPlayCountdown] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const recognitionRef = useRef<any>(null);
  const startWatchdogRef = useRef<NodeJS.Timeout | null>(null);
  // 수음 시작 후에도 결과가 오지 않는 세션을 끊는 워치독(무한 "듣는 중..." 방지)
  const sessionWatchdogRef = useRef<NodeJS.Timeout | null>(null);
  // localStorage 복원이 끝났는지 — 끝나기 전에 저장 이펙트가 기본값을 덮어쓰지 않도록
  const restoredRef = useRef(false);
  // 리스닝 자동 재생을 이미 실행한 문제 인덱스(문제당 1회 보장)
  const autoPlayedIndexRef = useRef(-1);
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoPlayTickRef = useRef<NodeJS.Timeout | null>(null);
  const { play, stop: stopAudio } = useAudioPlayer();
  const textInputRef = useRef<HTMLInputElement>(null);

  const clearStartWatchdog = useCallback(() => {
    if (startWatchdogRef.current) {
      clearTimeout(startWatchdogRef.current);
      startWatchdogRef.current = null;
    }
  }, []);

  const clearSessionWatchdog = useCallback(() => {
    if (sessionWatchdogRef.current) {
      clearTimeout(sessionWatchdogRef.current);
      sessionWatchdogRef.current = null;
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
      if (sessionWatchdogRef.current) clearTimeout(sessionWatchdogRef.current);
    };
  }, []);

  // iOS: 첫 사용자 입력에서 알림음 엘리먼트 잠금 해제 (제스처 밖에서 울리는 채점음 대비)
  useEffect(() => installFeedbackSoundUnlock(), []);

  // 리스닝은 말하기 전용이라 인식 불가 환경에선 선택 버튼이 비활성 — 기본값을 일반 모드로 되돌린다(시작 화면에서만).
  useEffect(() => {
    if (state.phase === "ready" && speechAvailability !== null && speechAvailability !== "available") {
      setQuizType("translate");
    }
  }, [state.phase, speechAvailability]);

  useEffect(() => {
    setTextInput("");
    setWritingActive(false);
    setAnswerShown(false);
    stopAudio();
    setIsPlaying(false);
  }, [state.currentIndex, stopAudio]);

  useEffect(() => {
    if (writingActive && state.phase === "question") {
      textInputRef.current?.focus();
    }
  }, [writingActive, state.phase, state.currentIndex]);

  const currentSentence = sessionSentences[state.currentIndex];
  // 번호는 필터와 무관하게 전체 목록 기준 — 학습 모드와 같은 #N을 보여야 한다(출제 범위로 다시 매기지 말 것)
  const sentenceNumbers = useMemo(() => buildSentenceNumbers(sentences), [sentences]);
  const progressPercent = sessionSentences.length > 0 ? Math.round(((state.currentIndex + 1) / sessionSentences.length) * 100) : 0;
  const speechThreshold = initialStats?.speech_strict ? STRICT_SIMILARITY_THRESHOLD : SIMILARITY_THRESHOLD;

  // 시작 화면에서 조건에 맞는 문장(정렬·문제 수 제한 전)
  const pool = useMemo(() => filterSentences(sentences, filter, sentenceNumbers), [sentences, filter, sentenceNumbers]);
  const plannedCount = limit > 0 ? Math.min(limit, pool.length) : pool.length;

  // 마지막 출제 조건 기억 (기기별 설정이라 localStorage). SSR-safe: 기본값으로 첫 렌더 후 복원.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(QUIZ_FILTER_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      const tags: string[] = Array.isArray(saved.filter?.tags) ? saved.filter.tags : [];
      const known = new Set(sentences.flatMap((s) => s.tags));
      setFilter({ ...EMPTY_FILTER, ...saved.filter, tags: tags.filter((t) => known.has(t)), numbers: null });
      setNumberInput(typeof saved.numberInput === "string" ? saved.numberInput : "");
      if (typeof saved.order === "string") setOrder(saved.order);
      if (typeof saved.limit === "number") setLimit(saved.limit);
    } catch {
      // 손상된 값은 무시하고 기본 조건으로 시작
    } finally {
      restoredRef.current = true;
    }
    // 최초 1회만 복원 — 이후 조건 변경은 아래 저장 이펙트가 담당
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 순번 원문 → filter.numbers 반영 (Set은 직렬화할 수 없어 원문만 저장한다)
  useEffect(() => {
    const { numbers } = parseNumberRanges(numberInput);
    setFilter((prev) => (prev.numbers === numbers ? prev : { ...prev, numbers }));
  }, [numberInput]);

  useEffect(() => {
    // 복원 전(첫 커밋)에 저장하면 방금 읽은 값을 기본값으로 덮어쓴다
    if (!restoredRef.current) return;
    try {
      localStorage.setItem(QUIZ_FILTER_KEY, JSON.stringify({ filter: { ...filter, numbers: null }, numberInput, order, limit }));
    } catch {
      // 저장 실패(사파리 프라이빗 등)는 무시 — 조건은 이번 세션에만 유지된다
    }
  }, [filter, numberInput, order, limit]);

  // 조건에 맞는 문장으로 세션을 시작. 여기서 스냅샷해 세션 중 필터·무작위 순서가 흔들리지 않게 한다.
  const startQuiz = useCallback(() => {
    if (pool.length === 0) {
      toast.error("조건에 해당하는 문장이 없습니다. 출제 범위를 조정해 주세요.");
      return;
    }
    const ordered = orderSentences(pool, order, sentenceNumbers);
    setSessionSentences(limit > 0 ? ordered.slice(0, limit) : ordered);
    autoPlayedIndexRef.current = -1; // 다시 풀기로 재시작해도 자동 재생이 다시 동작하도록
    dispatch({ type: "START" });
  }, [pool, order, limit, sentenceNumbers]);

  // 대기 중인 자동 재생(카운트다운 포함)을 취소한다 — 카드 클릭·말하기 등으로 먼저 움직이면 중복 재생이 되므로
  const cancelAutoPlay = useCallback(() => {
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }
    if (autoPlayTickRef.current) {
      clearInterval(autoPlayTickRef.current);
      autoPlayTickRef.current = null;
    }
    setAutoPlayCountdown(null);
  }, []);

  // 볼륨 균일화: 저장된 측정값으로 계산한 게인을 적용해 재생한다(미측정 문장은 게인 1.0).
  const playAudio = useCallback(
    (sentence: Sentence) => {
      cancelAutoPlay();
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
    [play, cancelAutoPlay],
  );

  // 리스닝 세션은 문제가 바뀔 때마다(첫 문제 포함) 음원을 한 번 자동 재생한다.
  // 문제 전환 시 오디오를 정리하는 위쪽 이펙트보다 나중에 선언해야 정리 → 재생 순서가 지켜진다.
  useEffect(() => {
    if (quizType !== "listening" || state.phase !== "question") return;
    // 다시 시도 등으로 question에 재진입해도 같은 문제를 다시 재생하지 않는다
    if (autoPlayedIndexRef.current === state.currentIndex) return;
    autoPlayedIndexRef.current = state.currentIndex;
    if (!currentSentence?.audio_url) return;
    // 지연은 /settings에서 고른 값(기기별). 예약 시점에 읽어 다른 탭의 변경도 다음 문제부터 반영된다.
    const delay = getAutoPlayDelay();
    if (delay <= 0) {
      playAudio(currentSentence); // 0초 = 카운트다운 없이 즉시 재생
      return;
    }
    // 남은 시간을 초 단위로 카드에 보여 준다(1초마다 감소)
    setAutoPlayCountdown(delay);
    autoPlayTickRef.current = setInterval(() => setAutoPlayCountdown((n) => (n && n > 1 ? n - 1 : n)), 1000);
    // 지연 중 말하기를 누르면(phase 변경) cleanup이 타이머를 취소해 수음과 겹치지 않는다
    autoPlayTimerRef.current = setTimeout(() => playAudio(currentSentence), delay * 1000);
    return cancelAutoPlay;
  }, [quizType, state.phase, state.currentIndex, currentSentence, playAudio, cancelAutoPlay]);

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

    // iOS는 재생 중인 오디오/AudioContext가 세션을 잡고 있으면 다음 인식이 시작되지 않을 수 있다.
    // 리스닝 퀴즈는 문제마다 자동 재생을 하므로 이 순서가 잦다 — 마이크를 요청하기 전에 확실히 놓아준다.
    stopAudio();
    setIsPlaying(false);

    dispatch({ type: "LISTEN" });

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = MAX_SPEECH_ALTERNATIVES;

    // 이 세션이 결과·에러로 이미 처리됐는지 — onend가 마무리(복귀)를 해야 하는지 판단한다
    let settled = false;

    recognition.onresult = (event: any) => {
      if (recognitionRef.current !== recognition) return; // 이미 교체된 옛 세션의 늦은 결과는 버린다
      settled = true;
      clearSessionWatchdog();
      // 1순위만 보지 않고 후보 전부를 채점해 최대 유사도를 채택한다
      const { text, match, similarity, alternatives } = pickBestAlternative(event, currentSentence.english_text, speechThreshold);
      console.log("[스피킹 인식]", { 인식: text, 후보: alternatives, 정답: currentSentence.english_text, 유사도: similarity, 정답여부: match });
      // 정답일 때만 모드별 정답 횟수 누적(문장 목록에 표시)
      if (match) void incrementPracticeCount(currentSentence.id, "speech");
      handleResult(match, text);
    };

    // 실제로 수음이 시작됐다는 신호 — 워치독 해제
    recognition.onstart = handleSpeechStarted;
    recognition.onaudiostart = handleSpeechStarted;

    recognition.onerror = (event: any) => {
      if (recognitionRef.current !== recognition) return; // 옛 세션의 늦은 에러가 새 세션을 튕겨내지 않게
      settled = true;
      clearStartWatchdog();
      clearSessionWatchdog();
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
      // 이미 교체된 옛 세션의 늦은 onend가 새 세션의 ref를 지우지 않게 한다
      if (recognitionRef.current !== recognition) return;
      clearSessionWatchdog();
      recognitionRef.current = null;
      // ⚠️ 결과도 에러도 없이 끝나는 경우가 있다(브라우저 자동 종료·조용한 abort·마이크 탈취 등).
      // 이때 복귀시키지 않으면 phase가 "listening"에 갇혀 "듣는 중..."이 무한히 남는다.
      if (!settled) dispatch({ type: "RETRY" });
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

    // 시작 워치독과 별개의 세션 워치독 — onstart는 왔지만 결과·에러·종료가 하나도 오지 않는 경우의 탈출구.
    // ⚠️ 여기서는 가용성을 "불가"로 기록하지 않는다(일시적 문제일 수 있어 말하기를 빼앗지 않는다).
    clearSessionWatchdog();
    sessionWatchdogRef.current = setTimeout(() => {
      sessionWatchdogRef.current = null;
      if (recognitionRef.current !== recognition) return; // 이미 종료·교체됨
      recognition.abort();
      recognitionRef.current = null;
      toast.warning("음성 인식이 응답하지 않아 중단했습니다. 다시 시도해 주세요.");
      dispatch({ type: "RETRY" });
    }, SPEECH_SESSION_TIMEOUT_MS);
  }, [speechSupported, currentSentence, handleResult, speechThreshold, clearStartWatchdog, clearSessionWatchdog, handleSpeechStarted, stopAudio]);

  // 즐겨찾기 토글 — 학습 모드와 같은 toggleFavorite 액션 재사용.
  // ⚠️ startTransition으로 감싸지 말 것: isPending이 쓰기 입력창·확인 버튼을 비활성화하는 데 묶여 있다.
  const handleToggleFavorite = useCallback(() => {
    if (!currentSentence) return;
    const { id } = currentSentence;
    const next = !currentSentence.is_favorite;
    // 카드가 읽는 건 세션 스냅샷이라 여기만 낙관적으로 갱신한다
    setSessionSentences((prev) => prev.map((s) => (s.id === id ? { ...s, is_favorite: next } : s)));
    void toggleFavorite(id, next).then((result) => {
      if (result?.error) {
        setSessionSentences((prev) => prev.map((s) => (s.id === id ? { ...s, is_favorite: !next } : s)));
        toast.error(result.error);
        return;
      }
      // ready 화면의 즐겨찾기 필터·학습 모드가 최신 값을 보도록(세션 스냅샷은 그대로 유지된다)
      router.refresh();
    });
  }, [currentSentence, router]);

  const handleNext = useCallback(() => {
    if (state.currentIndex + 1 >= sessionSentences.length) {
      dispatch({ type: "FINISH" });
    } else {
      dispatch({ type: "NEXT" });
    }
  }, [state.currentIndex, sessionSentences.length]);

  // 오답 결과의 "다음" — 음성 인식이 잘못 받아쓴 경우가 있어 오답으로 남기지 않고 정답으로 인정하고 넘어간다.
  const handleSkipAsCorrect = useCallback(() => {
    if (currentSentence) void incrementPracticeCount(currentSentence.id, mode);
    dispatch({ type: "ACCEPT" });
    handleNext();
  }, [currentSentence, mode, handleNext]);

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
        <p className="text-muted-foreground">
          {plannedCount === sentences.length
            ? `총 ${sentences.length}문장을 연습합니다.`
            : `총 ${sentences.length}문장 중 ${plannedCount}문장을 연습합니다.`}
        </p>

        <QuizFilterPanel
          sentences={sentences}
          filter={filter}
          onFilterChange={setFilter}
          numberInput={numberInput}
          onNumberInputChange={setNumberInput}
          order={order}
          onOrderChange={setOrder}
          limit={limit}
          onLimitChange={setLimit}
          matchedCount={pool.length}
          open={filterOpen}
          onOpenChange={setFilterOpen}
        />

        <div className="flex w-full max-w-md flex-col gap-3">
          {/* 리스닝이 기본값 — 말하기 전용이라 음성 인식이 안 되는 환경(iOS 비-Safari 등)에서는 선택할 수 없다 */}
          <Button
            variant={quizType === "listening" ? "brand" : "outline"}
            disabled={speechAvailability !== null && !speechSupported}
            onClick={() => setQuizType("listening")}
            className="h-auto flex-col items-start gap-1 px-5 py-4 text-left">
            <span className="text-base font-bold">리스닝 (듣고 따라 말하기)</span>
            <span className="text-sm font-normal opacity-80">오디오를 듣고 영어 문장을 따라 말해요.</span>
          </Button>
          <Button
            variant={quizType === "translate" ? "brand" : "outline"}
            onClick={() => setQuizType("translate")}
            className="h-auto flex-col items-start gap-1 px-5 py-4 text-left">
            <span className="text-base font-bold">일반 (한국어 → 영어)</span>
            <span className="text-sm font-normal opacity-80">한국어 뜻을 보고 영어로 말하거나 써요.</span>
          </Button>
        </div>

        {speechAvailability !== null && !speechSupported && (
          <p className="text-muted-foreground max-w-md text-sm">{speechUnavailableMessage(speechAvailability)}</p>
        )}

        <Button variant="brand" onClick={startQuiz} className="mt-2 h-14 px-10 text-lg font-bold">
          시작하기
        </Button>
      </div>
    );
  }

  // 세션 요약
  if (state.phase === "summary") {
    // 건너뛴 문제는 answers에 기록이 없다(배열 구멍) — 분모를 시도한 문제로 잡아야 오답으로 잡히지 않는다
    const attempted = state.answers.filter(Boolean).length;
    const correctCount = state.answers.filter((a) => a?.isCorrect).length;
    const summary: SessionSummaryType = {
      totalQuestions: attempted,
      correctCount,
      incorrectCount: attempted - correctCount,
      accuracy: attempted > 0 ? Math.round((correctCount / attempted) * 100) : 0,
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
          {state.currentIndex + 1}/{sessionSentences.length}
        </span>
      </div>

      {/* 문제 카드 */}
      {currentSentence &&
        (() => {
          const listenClickable = quizType === "listening" && !!currentSentence.audio_url && state.phase !== "listening" && !isPlaying;
          // 리스닝 세션은 문장을 통째로 숨기므로, 번호로 목록을 찾아보는 걸 막기 위해 정답 공개 후에만 노출
          const showNumber = quizType !== "listening" || state.resultStatus !== null || answerShown;
          return (
            <Card
              key={state.currentIndex}
              onClick={listenClickable ? () => playAudio(currentSentence) : undefined}
              role={listenClickable ? "button" : undefined}
              aria-label={listenClickable ? "오디오 듣기" : undefined}
              className={`animate-in fade-in slide-in-from-right-4 relative mx-auto w-full max-w-lg duration-300 ${
                listenClickable ? "hover:border-brand/50 cursor-pointer transition-colors" : ""
              } ${
                state.resultStatus === "correct"
                  ? "animate-pulse-glow ring-success ring-2"
                  : state.resultStatus === "incorrect"
                    ? "animate-shake ring-destructive ring-2"
                    : ""
              }`}>
              <CardContent className="flex min-h-[240px] flex-col items-center justify-center gap-6 py-10 text-center">
                {showNumber && (
                  <span className="text-muted-foreground/70 absolute top-3 left-4 text-xs font-semibold tabular-nums">
                    #{sentenceNumbers.get(currentSentence.id)}
                  </span>
                )}

                {/* 즐겨찾기 — 별은 문장 내용을 드러내지 않으므로 리스닝 세션에서도 노출한다 */}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={isPlaying || autoPlayCountdown !== null}
                  aria-label={currentSentence.is_favorite ? "즐겨찾기 해제" : "즐겨찾기"}
                  onClick={(e) => {
                    e.stopPropagation(); // 리스닝 세션은 카드 클릭이 오디오 재생이라 필수
                    handleToggleFavorite();
                  }}
                  className={`absolute top-2 right-2 ${
                    currentSentence.is_favorite ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-amber-500"
                  }`}>
                  <Star className={`h-4 w-4 ${currentSentence.is_favorite ? "fill-current" : ""}`} />
                </Button>

                {quizType === "listening" ? (
                  <>
                    <p className="text-muted-foreground text-sm font-medium">
                      {isPlaying ? "재생 중..." : autoPlayCountdown !== null ? "잠시 후 자동 재생됩니다" : "카드를 눌러 듣고 따라 말해 보세요"}
                    </p>
                    {isPlaying ? (
                      <Loader2 className="text-brand h-12 w-12 animate-spin" />
                    ) : autoPlayCountdown !== null ? (
                      <span className="text-brand h-12 animate-pulse text-4xl font-bold tabular-nums" aria-live="polite">
                        {autoPlayCountdown}
                      </span>
                    ) : (
                      <Volume2 className="text-brand h-12 w-12" />
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-muted-foreground text-sm font-medium">이 문장을 영어로 말하거나 입력하세요</p>
                    <p className="text-2xl leading-relaxed font-bold">{currentSentence.korean_text}</p>
                  </>
                )}

                {/* 인라인 정답 — 채점 전이라 정답/오답 색을 쓰지 않는다. 수음 중에도 남아 있어 읽으며 말할 수 있다. */}
                {answerShown && state.resultStatus === null && (
                  <div className="animate-in fade-in flex flex-col gap-1">
                    <p className="text-xl leading-relaxed font-bold">{currentSentence.english_text}</p>
                    {quizType === "listening" && <p className="text-muted-foreground text-sm">{currentSentence.korean_text}</p>}
                  </div>
                )}

                {/* 정답 피드백 */}
                {state.resultStatus === "correct" && (
                  <div className="animate-in fade-in">
                    <p className="text-success text-lg font-semibold">정확합니다!</p>
                    <p className="text-muted-foreground mt-1 text-sm">{currentSentence.english_text}</p>
                    {quizType === "listening" && <p className="text-muted-foreground text-sm font-medium">{currentSentence.korean_text}</p>}
                    {state.recognizedText && <p className="text-muted-foreground mt-1 text-xs">인식된 문장: &quot;{state.recognizedText}&quot;</p>}
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
                // 자동 재생 대기(카운트다운)~재생이 끝날 때까지는 수음을 막는다 — 음원과 마이크가 겹치지 않게
                disabled={!speechSupported || isPlaying || autoPlayCountdown !== null}
                onClick={() => {
                  setWritingActive(false);
                  setMode("speech");
                  startRecognition();
                }}
                className="h-12 flex-1 text-base font-semibold">
                <Mic className="mr-2 h-5 w-5" />
                말하기
              </Button>
              {quizType === "translate" && (
                <Button
                  variant={writingActive ? "destructive" : "outline"}
                  disabled={isPlaying || autoPlayCountdown !== null}
                  onClick={() => {
                    if (writingActive) {
                      setWritingActive(false);
                      setTextInput("");
                    } else {
                      setMode("text");
                      setWritingActive(true);
                    }
                  }}
                  className="h-12 flex-1 text-base font-semibold">
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
                  disabled={isPending || isPlaying}
                  className="h-12 flex-1 text-base"
                />
                <Button
                  type="submit"
                  variant="brand"
                  disabled={!textInput.trim() || isPending || isPlaying}
                  className="h-12 px-5 text-base font-semibold">
                  확인
                </Button>
              </form>
            )}
          </div>
        )}

        {state.phase === "listening" && (
          <Button
            variant="destructive"
            onClick={() => {
              // 인식 객체가 이미 사라진 뒤에도(세션이 조용히 끝난 경우) 화면은 반드시 복구되어야 한다 —
              // abort 여부와 무관하게 질문 화면으로 되돌린다. abort의 onerror가 뒤늦게 와도 RETRY라 무해하다.
              recognitionRef.current?.abort();
              recognitionRef.current = null;
              dispatch({ type: "RETRY" });
            }}
            className="mx-auto h-14 w-14 rounded-full">
            <MicOff className="h-6 w-6" />
          </Button>
        )}

        {state.phase === "listening" && (
          <p className="text-muted-foreground text-center text-sm" aria-live="polite">
            <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
            듣는 중...
          </p>
        )}

        {/* 정답 보기는 채점하지 않는다 — 카드 안에 정답을 띄워 두고 그대로 말할 수 있게 하는 토글.
            수음 중(다시 시도 포함)에도 필요하므로 결과가 나오기 전이면 계속 노출한다(수음 화면에선 "듣는 중..." 아래). */}
        {(state.phase === "question" || state.phase === "listening") && currentSentence && (
          <Button
            type="button"
            variant="ghost"
            disabled={isPlaying || autoPlayCountdown !== null}
            onClick={() => setAnswerShown((v) => !v)}
            className={`h-10 text-sm ${answerShown ? "text-brand" : "text-muted-foreground"}`}>
            {answerShown ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
            {answerShown ? "정답 숨기기" : "정답 보기"}
          </Button>
        )}

        {/* 이미 충분히 연습한 문장은 그냥 넘긴다 — answers에 기록하지 않아 요약·연습 횟수·오늘 진도 어디에도 반영되지 않는다 */}
        {state.phase === "question" && currentSentence && (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isPlaying || autoPlayCountdown !== null}
                  className="text-muted-foreground h-10 text-sm"
                />
              }>
              <SkipForward className="mr-1 h-4 w-4" />
              skip
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>문제 건너뛰기</AlertDialogTitle>
                <AlertDialogDescription>이 문제를 건너뛸까요? 연습 횟수·오늘 진도와 세션 요약 어디에도 기록되지 않습니다.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={handleNext}>건너뛰기</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {state.resultStatus === "incorrect" && (
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                if (mode === "speech") {
                  // ⚠️ setTimeout으로 감싸지 말 것 — iOS Safari는 start()가 사용자 제스처와 같은 태스크에
                  // 있어야 마이크를 잡는다(지연을 두면 두 번째 시도부터 조용히 실패). LISTEN도 내부에서 dispatch한다.
                  startRecognition();
                } else {
                  dispatch({ type: "RETRY" });
                  setTextInput("");
                }
              }}
              className="h-12 flex-1 text-base">
              다시 시도
            </Button>
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="brand" className="h-12 flex-1 text-base font-semibold" />}>다음</AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>다음 문제로 이동</AlertDialogTitle>
                  <AlertDialogDescription>정말로 다음으로 넘어가시겠습니까?</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSkipAsCorrect}>다음</AlertDialogAction>
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
