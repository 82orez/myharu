"use client";

import { useState, useCallback, useRef, useTransition, useEffect, useMemo } from "react";
import {
  Volume2,
  Trash2,
  Loader2,
  Eye,
  EyeOff,
  Star,
  Pencil,
  Mic,
  MicOff,
  Check,
  Circle,
  Keyboard,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Tag,
  ArrowLeftRight,
  X,
  Plus,
  StickyNote,
  Upload,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { deleteSentence, toggleFavorite, updateSentence, type Sentence } from "@/app/(learn)/learn/review/actions";
import { generateAudio } from "@/app/(learn)/learn/input/actions";
import { recordPracticeResult } from "@/app/(learn)/learn/review/gamification-actions";
import {
  getSpeechAvailability,
  unavailableKind,
  rememberUnavailable,
  forgetUnavailable,
  speechUnavailableMessage,
  SPEECH_START_TIMEOUT_MS,
  type SpeechAvailability,
} from "@/lib/speech-recognition";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import TagPicker from "@/components/learn/TagPicker";
import VoicePicker from "@/components/learn/VoicePicker";
import { textsMatch, SIMILARITY_THRESHOLD, STRICT_SIMILARITY_THRESHOLD } from "@/lib/normalize-text";
import { tagColorClass, tagChipClass } from "@/lib/tag-color";
import { useSelectedVoice } from "@/hooks/use-selected-voice";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { computeGain, measureAudioBytes, type AudioStats } from "@/lib/audio-loudness";
import { ALLOWED_AUDIO, arrayBufferToBase64, AUDIO_FORMAT_ERROR, AUDIO_SIZE_ERROR, MAX_AUDIO_BYTES } from "@/lib/audio-formats";
import { playFeedbackSound } from "@/lib/feedback-sound";
import { toast } from "sonner";

type SortMode = "latest" | "oldest" | "alpha" | "practice-desc" | "practice-asc";

// created_at(ISO) → KST 날짜 문자열(YYYY-MM-DD)
const kstDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

// 문장의 총 정답 연습 횟수(스피킹 + 쓰기). 0이면 "미연습"
const practiceTotal = (s: Sentence) => s.speech_count + s.text_count;

// 페이지당 문장 카드 수 (클라이언트 사이드 페이지네이션)
const PAGE_SIZE = 20;

// 페이지 번호 윈도잉: 항상 1·마지막 + 현재 ±1, 간격은 "…"
const getPageWindow = (current: number, total: number): (number | "…")[] => {
  const nums = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = Array.from(nums)
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push("…");
    out.push(n);
    prev = n;
  }
  return out;
};

// 입력일(KST) 기간 프리셋. days는 오늘을 포함한 일수, all은 제한 없음
const DAY_RANGES = [
  { value: "all", label: "전체 일자", days: 0 },
  { value: "today", label: "오늘", days: 1 },
  { value: "3d", label: "최근 3일", days: 3 },
  { value: "7d", label: "최근 일주일", days: 7 },
  { value: "30d", label: "최근 한달", days: 30 },
] as const;

type DayRange = (typeof DAY_RANGES)[number]["value"];

// 프리셋의 시작 경계 날짜(YYYY-MM-DD). all이면 null
function rangeCutoff(range: DayRange): string | null {
  const days = DAY_RANGES.find((r) => r.value === range)?.days ?? 0;
  if (days <= 0) return null;
  return kstDate(new Date(Date.now() - (days - 1) * 86400000).toISOString());
}

// 편집 중 교체 대기 상태인 새 음성. 저장을 눌러야 실제로 반영된다(취소하면 폐기).
type StagedAudio = {
  base64: string;
  mime: string;
  ext: string;
  stats: AudioStats | null;
  url: string; // 미리듣기용 blob URL
  source: "ai" | "upload";
};

type EditState = {
  id: string;
  englishText: string;
  koreanText: string;
  tags: string[];
  note: string;
  currentAudioUrl: string; // 기존 음성(서명 URL) — 미리듣기용
  newAudio: StagedAudio | null;
};

export default function ReviewClient({
  initialSentences,
  initialError,
  initialPresets = [],
  speechStrict = false,
}: {
  initialSentences: Sentence[];
  initialError?: string;
  initialPresets?: string[];
  speechStrict?: boolean;
}) {
  const [sentences, setSentences] = useState(initialSentences);
  const [presets, setPresets] = useState<string[]>(initialPresets);
  const [voice, setVoice] = useSelectedVoice();
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  // 입력일 기간 프리셋(DAY_RANGES)
  const [dayFilter, setDayFilter] = useState<DayRange>("all");
  const [search, setSearch] = useState("");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  // 태그가 하나도 없는 문장만 필터 (태그 선택과 상호 배타)
  const [noTagOnly, setNoTagOnly] = useState(false);
  // 태그 다중 선택 결합 방식: and = 모두 포함, or = 하나라도 포함
  const [tagMode, setTagMode] = useState<"and" | "or">("and");
  const [sort, setSort] = useState<SortMode>("latest");
  const [page, setPage] = useState(1);
  const [showFind, setShowFind] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [koreanHiddenIds, setKoreanHiddenIds] = useState<Set<string>>(new Set()); // 한글 뜻 카드별 숨김 (기본 표시)
  const [notesShownIds, setNotesShownIds] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, startSaving] = useTransition();
  const [regenerating, startRegenerating] = useTransition();
  // AI 음성 재생성 확인(토큰 소모) 다이얼로그
  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false);
  // null = 아직 판정 전(SSR/첫 렌더) — 안내 문구가 깜빡이지 않도록 구분한다.
  const [speechAvailability, setSpeechAvailability] = useState<SpeechAvailability | null>(null);
  const speechSupported = speechAvailability === "available";
  const [listeningId, setListeningId] = useState<string | null>(null);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<"correct" | "incorrect" | null>(null);
  const [writingId, setWritingId] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");
  const { play } = useAudioPlayer();
  const recognitionRef = useRef<any>(null);
  const feedbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startWatchdogRef = useRef<NodeJS.Timeout | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  // 스테이징된 음성의 blob URL — 교체/취소/저장/언마운트 시 해제해야 해서 ref로도 들고 있는다
  const stagedAudioUrlRef = useRef<string | null>(null);

  // 수음이 실제로 시작됨 — 워치독 해제 + 과거 실패 기록 폐기
  const clearStartWatchdog = useCallback(() => {
    if (startWatchdogRef.current) {
      clearTimeout(startWatchdogRef.current);
      startWatchdogRef.current = null;
    }
  }, []);

  const handleSpeechStarted = useCallback(() => {
    clearStartWatchdog();
    forgetUnavailable();
  }, [clearStartWatchdog]);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      if (startWatchdogRef.current) clearTimeout(startWatchdogRef.current);
    };
  }, []);

  useEffect(() => {
    if (writingId) textInputRef.current?.focus();
  }, [writingId]);

  useEffect(() => {
    setSpeechAvailability(getSpeechAvailability());
  }, []);

  // 볼륨 균일화: 저장된 측정값으로 계산한 게인을 적용해 재생한다(미측정 문장은 게인 1.0).
  const playAudio = useCallback(
    (sentence: Sentence) => {
      // iOS는 음성 인식이 마이크를 잡고 있으면 오디오 세션이 녹음 상태라 재생이 무음이 된다.
      // onend가 이미 지나갔더라도 남아 있는 인식 객체를 확실히 끊고 재생한다.
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
        setListeningId(null);
      }
      setPlayingId(sentence.id);
      void play(sentence.audio_url, computeGain(sentence.loudness_db, sentence.peak_db), {
        onEnded: () => setPlayingId(null),
        onError: () => setPlayingId(null),
      });
    },
    [play],
  );

  const triggerFeedback = useCallback((sentenceId: string, status: "correct" | "incorrect") => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setFeedbackId(sentenceId);
    setFeedbackStatus(status);
    feedbackTimerRef.current = setTimeout(() => {
      setFeedbackId(null);
      setFeedbackStatus(null);
    }, 1500);
  }, []);

  const handleTextSubmit = useCallback(
    (sentenceId: string, targetText: string) => {
      const trimmed = textInput.trim();
      if (!trimmed) return;
      const { match } = textsMatch(trimmed, targetText);
      // 판정 즉시 소리 — 서버 왕복(recordPracticeResult)을 기다리면 늦게 울린다
      playFeedbackSound(match ? "correct" : "incorrect");
      startTransition(async () => {
        const result = await recordPracticeResult(sentenceId, match, "text");
        if (result.error) {
          toast.error(result.error);
          return;
        }
        triggerFeedback(sentenceId, match ? "correct" : "incorrect");
        setSentences((prev) => prev.map((s) => (s.id === sentenceId ? { ...s, text_count: s.text_count + (match ? 1 : 0) } : s)));
        if (match) {
          toast.success("정확합니다!");
          setWritingId(null);
          setTextInput("");
        } else {
          toast.error("다시 시도하세요.", { description: `입력: "${trimmed}"` });
          setTextInput("");
          setTimeout(() => textInputRef.current?.focus(), 50);
        }
      });
    },
    [textInput, triggerFeedback, startTransition],
  );

  const startRecognition = useCallback(
    (sentenceId: string, targetText: string) => {
      if (!speechSupported) return;

      if (writingId !== null) {
        setWritingId(null);
        setTextInput("");
      }

      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        const recognizedText = event.results[0][0].transcript;
        const threshold = speechStrict ? STRICT_SIMILARITY_THRESHOLD : SIMILARITY_THRESHOLD;
        const { match, similarity } = textsMatch(recognizedText, targetText, threshold);
        console.log("[스피킹 인식]", { 인식: recognizedText, 정답: targetText, 유사도: similarity, 정답여부: match });
        // 판정 즉시 소리 — 서버 왕복(recordPracticeResult)을 기다리면 늦게 울린다
        playFeedbackSound(match ? "correct" : "incorrect");
        startTransition(async () => {
          const result = await recordPracticeResult(sentenceId, match, "speech");
          if (result.error) {
            toast.error(result.error);
            return;
          }
          triggerFeedback(sentenceId, match ? "correct" : "incorrect");
          setSentences((prev) => prev.map((s) => (s.id === sentenceId ? { ...s, speech_count: s.speech_count + (match ? 1 : 0) } : s)));
          if (match) {
            toast.success("정확합니다!");
          } else {
            toast.error("다시 시도하세요.", { description: `인식된 문장: "${recognizedText}"` });
          }
        });
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
        // 인식 서비스 자체를 쓸 수 없는 환경
        if (event.error === "service-not-allowed" || event.error === "language-not-supported") {
          const availability = unavailableKind();
          rememberUnavailable(availability);
          setSpeechAvailability(availability);
        }
        setListeningId(null);
      };

      recognition.onend = () => {
        clearStartWatchdog();
        setListeningId(null);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      setListeningId(sentenceId);
      recognition.start();

      // 가용성 판정은 여기서만 한다(UA 사전 차단 없음).
      // 동작하지 않는 환경은 start()가 마이크 권한만 요청하고 어떤 이벤트도 발생시키지 않는다.
      clearStartWatchdog();
      startWatchdogRef.current = setTimeout(() => {
        startWatchdogRef.current = null;
        if (recognitionRef.current !== recognition) return; // 이미 종료·교체됨
        recognition.abort();
        recognitionRef.current = null;
        setListeningId(null);
        const availability = unavailableKind();
        rememberUnavailable(availability);
        setSpeechAvailability(availability);
        toast.warning(speechUnavailableMessage(availability));
      }, SPEECH_START_TIMEOUT_MS);
    },
    [speechSupported, startTransition, triggerFeedback, writingId, speechStrict, clearStartWatchdog, handleSpeechStarted],
  );

  const handleToggleFavorite = useCallback(
    (id: string, currentValue: boolean) => {
      setSentences((prev) => prev.map((s) => (s.id === id ? { ...s, is_favorite: !currentValue } : s)));

      startTransition(async () => {
        const result = await toggleFavorite(id, !currentValue);
        if (result.error) {
          setSentences((prev) => prev.map((s) => (s.id === id ? { ...s, is_favorite: currentValue } : s)));
          toast.error(result.error);
        }
      });
    },
    [startTransition],
  );

  const handleDelete = useCallback(
    (id: string) => {
      setDeletingId(id);

      startTransition(async () => {
        const result = await deleteSentence(id);
        setDeletingId(null);
        if (result.error) {
          toast.error(result.error);
        } else {
          setRemovingId(id);
          setTimeout(() => {
            setSentences((prev) => prev.filter((s) => s.id !== id));
            setRemovingId(null);
          }, 300);
        }
      });
    },
    [startTransition],
  );

  // 스테이징된 음성의 blob URL 해제 (교체/취소/저장/언마운트 공용)
  const revokeStagedAudio = useCallback(() => {
    if (stagedAudioUrlRef.current) {
      URL.revokeObjectURL(stagedAudioUrlRef.current);
      stagedAudioUrlRef.current = null;
    }
  }, []);

  useEffect(() => revokeStagedAudio, [revokeStagedAudio]);

  const startEditing = (sentence: Sentence) => {
    if (writingId !== null) {
      setWritingId(null);
      setTextInput("");
    }
    revokeStagedAudio();
    setEditing({
      id: sentence.id,
      englishText: sentence.english_text,
      koreanText: sentence.korean_text,
      tags: sentence.tags,
      note: sentence.note,
      currentAudioUrl: sentence.audio_url,
      newAudio: null,
    });
  };

  const cancelEditing = () => {
    revokeStagedAudio();
    setEditing(null);
  };

  // 새 음성을 스테이징(이전 스테이징 blob은 해제). 저장 전까지 서버는 건드리지 않는다.
  const stageAudio = (staged: Omit<StagedAudio, "url">, blobUrl: string) => {
    revokeStagedAudio();
    stagedAudioUrlRef.current = blobUrl;
    setEditing((prev) => (prev ? { ...prev, newAudio: { ...staged, url: blobUrl } } : prev));
  };

  const revertStagedAudio = () => {
    revokeStagedAudio();
    setEditing((prev) => (prev ? { ...prev, newAudio: null } : prev));
  };

  // AI 음성 재생성 — 영어 문장 수정 여부와 무관하게 언제든 가능
  const handleRegenAudio = () => {
    if (!editing) return;
    const english = editing.englishText.trim();
    if (!english) {
      toast.error("영어 문장을 입력해 주세요.");
      return;
    }

    startRegenerating(async () => {
      const result = await generateAudio(english, voice);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      const bytes = Uint8Array.from(atob(result.audioBase64), (c) => c.charCodeAt(0));
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
      // 음성을 새로 만들었으니 볼륨 균일화용 측정값도 다시 구한다
      const stats = await measureAudioBytes(bytes.buffer);
      stageAudio({ base64: result.audioBase64, mime: "audio/mpeg", ext: "mp3", stats, source: "ai" }, blobUrl);
    });
  };

  const handleEditFileSelected = async (file: File) => {
    const ext = ALLOWED_AUDIO[file.type];
    if (!file.type.startsWith("audio/") || !ext) {
      toast.error(AUDIO_FORMAT_ERROR);
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      toast.error(AUDIO_SIZE_ERROR);
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      // base64 인코딩을 먼저 끝낸다 — measureAudioBytes 내부의 decodeAudioData가 버퍼를 detach 시킬 수 있다
      const base64 = arrayBufferToBase64(buffer);
      const stats = await measureAudioBytes(buffer);
      stageAudio({ base64, mime: file.type, ext, stats, source: "upload" }, URL.createObjectURL(file));
    } catch {
      toast.error("파일을 읽는 중 오류가 발생했습니다. 다시 시도해 주세요.");
    }
  };

  const handleSaveEdit = () => {
    if (!editing) return;

    const newAudio = editing.newAudio;

    startSaving(async () => {
      const result = await updateSentence(
        editing.id,
        editing.englishText,
        editing.koreanText,
        editing.tags,
        editing.note,
        newAudio ? { base64: newAudio.base64, mime: newAudio.mime, ext: newAudio.ext, stats: newAudio.stats } : undefined,
      );

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      setSentences((prev) =>
        prev.map((s) =>
          s.id === editing.id
            ? {
                ...s,
                english_text: editing.englishText.trim(),
                korean_text: editing.koreanText.trim(),
                audio_url: result.audioUrl,
                tags: editing.tags,
                note: editing.note.trim(),
                // 음성을 교체한 경우에만 측정값 교체 — 다음 재생에 새 게인이 반영되도록
                ...(newAudio ? { loudness_db: newAudio.stats?.loudnessDb ?? null, peak_db: newAudio.stats?.peakDb ?? null } : {}),
              }
            : s,
        ),
      );
      toast.success("문장이 수정되었습니다.");
      revokeStagedAudio();
      setEditing(null);
    });
  };

  const isEditing = editing !== null;
  // 편집 폼 내 작업 진행 중(저장 또는 AI 음성 생성) — 폼 버튼 전체 비활성용
  const editPending = saving || regenerating;
  const isBusy = playingId !== null || isEditing || listeningId !== null || writingId !== null;

  // 전체 문장의 distinct 태그(태그 필터 칩 / 편집 자동완성용)
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const s of sentences) for (const t of s.tags) set.add(t);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [sentences]);

  const toggleTag = (t: string) => {
    setNoTagOnly(false);
    setTagFilters((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  // 필터 결합: 입력일 → 즐겨찾기 → 태그(다중 AND) → 검색(문장·뜻)
  const cutoff = rangeCutoff(dayFilter);
  const byDay = cutoff ? sentences.filter((s) => kstDate(s.created_at) >= cutoff) : sentences;
  const q = search.trim().toLowerCase();
  const pool = byDay.filter((s) => {
    if (favoriteOnly && !s.is_favorite) return false;
    if (noTagOnly) {
      if (s.tags.length > 0) return false;
    } else if (tagFilters.length > 0) {
      const hit = tagMode === "or" ? tagFilters.some((t) => s.tags.includes(t)) : tagFilters.every((t) => s.tags.includes(t));
      if (!hit) return false;
    }
    if (q && !`${s.english_text} ${s.korean_text}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const visibleSentences = pool.slice().sort((a, b) => {
    if (sort === "alpha") return a.english_text.localeCompare(b.english_text, "en");
    if (sort === "practice-desc" || sort === "practice-asc") {
      const diff = practiceTotal(a) - practiceTotal(b);
      if (diff !== 0) return sort === "practice-asc" ? diff : -diff;
      return -a.created_at.localeCompare(b.created_at); // 동점(0회 등)은 최신순
    }
    const cmp = a.created_at.localeCompare(b.created_at);
    return sort === "oldest" ? cmp : -cmp;
  });

  // 필터·정렬 변경 시 1페이지로 리셋
  useEffect(() => {
    setPage(1);
  }, [dayFilter, favoriteOnly, tagFilters, noTagOnly, search, sort]);

  // 현재 페이지 분량만 렌더 (삭제 등으로 페이지 초과 시 클램프)
  const totalPages = Math.max(1, Math.ceil(visibleSentences.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = visibleSentences.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const goToPage = (p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-center text-2xl font-extrabold">문장 목록</h1>

      {sentences.length > 0 && (
        <div className="flex flex-col gap-3">
          {/* 조회 조건: 입력일 · 즐겨찾기 · 검색 · 정렬 */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={dayFilter}
              onChange={(e) => setDayFilter(e.target.value as DayRange)}
              aria-label="입력일"
              className="border-input bg-background ring-ring/10 focus-visible:border-ring focus-visible:ring-ring/20 h-8 rounded-md border px-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
            >
              {DAY_RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              aria-pressed={favoriteOnly}
              onClick={() => setFavoriteOnly((v) => !v)}
              className={favoriteOnly ? "border-amber-500 bg-amber-500/10 text-amber-600" : "text-amber-500"}
            >
              <Star className={`mr-1 h-4 w-4 ${favoriteOnly ? "fill-current" : ""}`} />
              즐겨찾기
            </Button>
            <Button variant={showFind || search ? "brand" : "outline"} size="sm" onClick={() => setShowFind((v) => !v)}>
              <Search className="mr-1 h-4 w-4" />
              검색
              <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${showFind ? "rotate-180" : ""}`} />
            </Button>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              aria-label="정렬"
              className="border-input bg-background ring-ring/10 focus-visible:border-ring focus-visible:ring-ring/20 h-8 rounded-md border px-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
            >
              <option value="latest">최신순</option>
              <option value="oldest">오래된순</option>
              <option value="alpha">가나다순(A–Z)</option>
              <option value="practice-desc">연습 많은순</option>
              <option value="practice-asc">연습 적은순</option>
            </select>
          </div>

          {showFind && (
            <div className="relative">
              <Search size={16} className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="영어 문장/한글 뜻 검색"
                className="h-9 pr-9 pl-9"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="검색어 지우기"
                  className="hover:bg-muted text-muted-foreground absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {/* 태그 필터 */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={tagFilters.length === 0 && !noTagOnly ? "brand" : "outline"}
                size="sm"
                onClick={() => {
                  setTagFilters([]);
                  setNoTagOnly(false);
                }}
              >
                <Tag className="mr-1 h-4 w-4" />
                전체 {pool.length}
              </Button>
              {allTags.map((t) => (
                <Button
                  key={t}
                  variant="outline"
                  size="sm"
                  aria-pressed={tagFilters.includes(t)}
                  onClick={() => toggleTag(t)}
                  className={`${tagChipClass(t)} border-transparent ${tagFilters.includes(t) ? "ring-foreground/40 ring-2" : ""}`}
                >
                  {t}
                </Button>
              ))}
              {tagFilters.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`태그 조건: ${tagMode === "and" ? "모두 포함" : "하나라도"} (클릭하여 전환)`}
                  onClick={() => setTagMode((m) => (m === "and" ? "or" : "and"))}
                >
                  <ArrowLeftRight className="mr-1 h-4 w-4" />
                  {tagMode === "and" ? "모두 포함" : "하나라도"}
                </Button>
              )}
              {sentences.some((s) => s.tags.length === 0) && (
                <Button
                  variant={noTagOnly ? "brand" : "outline"}
                  size="sm"
                  aria-pressed={noTagOnly}
                  onClick={() => {
                    setNoTagOnly((v) => !v);
                    setTagFilters([]);
                  }}
                >
                  없음
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {speechAvailability !== null && speechAvailability !== "available" && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {speechUnavailableMessage(speechAvailability)}
        </p>
      )}

      {initialError && (
        <p className="text-destructive text-sm" role="alert">
          {initialError}
        </p>
      )}

      {sentences.length === 0 && !initialError && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <p className="text-muted-foreground">아직 저장된 문장이 없습니다.</p>
          <Button variant="brand" nativeButton={false} render={<Link href="/learn/input" />}>
            <Plus size={16} />첫 문장 등록하기
          </Button>
        </div>
      )}

      {sentences.length > 0 && visibleSentences.length === 0 && (
        <p className="text-muted-foreground py-12 text-center">선택한 조건에 해당하는 문장이 없습니다.</p>
      )}

      <div className="flex flex-col gap-4">
        {pageItems.map((sentence, index) => {
          const isPlaying = playingId === sentence.id;
          const isListening = listeningId === sentence.id;
          const isWriting = writingId === sentence.id;
          const isDeleting = deletingId === sentence.id;
          const isRemoving = removingId === sentence.id;
          const busyPlaying = playingId !== null;
          const isThisEditing = editing?.id === sentence.id;

          const isFeedback = feedbackId === sentence.id;
          const feedbackClass =
            isFeedback && feedbackStatus === "correct"
              ? "animate-pulse-glow ring-2 ring-success"
              : isFeedback && feedbackStatus === "incorrect"
                ? "animate-shake ring-2 ring-destructive"
                : "";

          return (
            <Card
              key={sentence.id}
              className={`animate-in fade-in slide-in-from-bottom-2 fill-mode-both relative ${practiceTotal(sentence) > 0 ? "border-l-success border-l-2" : "border-l-accent-orange/40 border-l-2"} ${feedbackClass} ${isRemoving ? "animate-out fade-out slide-out-to-left fill-mode-forwards duration-300" : ""}`}
              style={{ animationDelay: isRemoving ? "0ms" : `${Math.min(index, 5) * 100}ms`, animationDuration: isRemoving ? "300ms" : "400ms" }}
            >
              <CardContent className="flex flex-col gap-3">
                {isThisEditing && editing ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-muted-foreground text-xs">한국어 뜻</Label>
                      <Input value={editing.koreanText} onChange={(e) => setEditing({ ...editing, koreanText: e.target.value })} maxLength={500} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-muted-foreground text-xs">영어 문장</Label>
                      <textarea
                        value={editing.englishText}
                        onChange={(e) => setEditing({ ...editing, englishText: e.target.value })}
                        maxLength={500}
                        className="border-input bg-background ring-ring/10 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/20 flex min-h-[60px] w-full rounded-md border px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-muted-foreground text-xs">태그</Label>
                      <TagPicker
                        value={editing.tags}
                        onChange={(next) => setEditing({ ...editing, tags: next })}
                        presets={presets}
                        onPresetsChange={setPresets}
                        onTagRenamed={(oldName, newName) => {
                          setSentences((prev) => prev.map((s) => ({ ...s, tags: s.tags.map((t) => (t === oldName ? newName : t)) })));
                          setTagFilters((prev) => Array.from(new Set(prev.map((t) => (t === oldName ? newName : t)))));
                        }}
                        onTagDeleted={(tag) => {
                          setSentences((prev) => prev.map((s) => ({ ...s, tags: s.tags.filter((t) => t !== tag) })));
                          setTagFilters((prev) => prev.filter((t) => t !== tag));
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-muted-foreground text-xs">메모</Label>
                      <textarea
                        value={editing.note}
                        onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                        maxLength={1000}
                        placeholder="이 문장과 관련된 메모"
                        rows={6}
                        className="border-input bg-background ring-ring/10 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/20 flex min-h-[140px] w-full rounded-md border px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-muted-foreground text-xs">
                        {editing.newAudio ? (
                          <span className="text-brand">
                            새 음성 ({editing.newAudio.source === "upload" ? "업로드" : "AI 생성"}) · 저장하면 교체됩니다
                          </span>
                        ) : (
                          "음성"
                        )}
                      </Label>
                      {/* 미리듣기는 폼 로컬 audio 엘리먼트 — 카드 재생용 useAudioPlayer(싱글턴 + Web Audio)와 섞지 않는다 */}
                      <audio src={editing.newAudio?.url ?? editing.currentAudioUrl} controls className="w-full" />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRegenConfirmOpen(true)}
                          disabled={editPending || !editing.englishText.trim()}
                        >
                          {regenerating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1 h-4 w-4" />}
                          {regenerating ? "생성 중..." : "AI 음성 재생성"}
                        </Button>
                        <VoicePicker value={voice} onChange={setVoice} disabled={editPending} className="h-8 gap-1 px-3 text-xs" />
                        <Button variant="outline" size="sm" onClick={() => editFileInputRef.current?.click()} disabled={editPending}>
                          <Upload className="mr-1 h-4 w-4" />
                          음원 파일 업로드
                        </Button>
                        {editing.newAudio && (
                          <Button variant="ghost" size="sm" onClick={revertStagedAudio} disabled={editPending} className="text-muted-foreground">
                            <Undo2 className="mr-1 h-4 w-4" />
                            되돌리기
                          </Button>
                        )}
                      </div>
                      <input
                        ref={editFileInputRef}
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleEditFileSelected(file);
                          e.target.value = ""; // 같은 파일 재선택 허용
                        }}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={cancelEditing} disabled={editPending}>
                        취소
                      </Button>
                      <Button
                        variant="brand"
                        size="sm"
                        onClick={handleSaveEdit}
                        disabled={editPending || !editing.englishText.trim() || !editing.koreanText.trim()}
                      >
                        {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                        {saving ? "저장 중..." : "저장"}
                      </Button>
                    </div>

                    <AlertDialog open={regenConfirmOpen} onOpenChange={setRegenConfirmOpen}>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>AI 음성을 생성할까요?</AlertDialogTitle>
                          <AlertDialogDescription render={<div />}>
                            <ul className="list-disc space-y-1 pl-5 text-left">
                              <li>현재 편집 중인 영어 문장으로 새 음성을 만듭니다.</li>
                              <li>확인 버튼을 클릭하면 Token이 소모됩니다.</li>
                            </ul>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>취소</AlertDialogCancel>
                          <AlertDialogAction
                            variant="brand"
                            onClick={() => {
                              setRegenConfirmOpen(false);
                              handleRegenAudio();
                            }}
                          >
                            확인
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {sentence.audio_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={(busyPlaying && !isPlaying) || isEditing || listeningId !== null}
                            onClick={() => playAudio(sentence)}
                          >
                            {isPlaying ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Volume2 className="mr-1 h-4 w-4" />}
                            듣기
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isBusy}
                          onClick={() =>
                            setKoreanHiddenIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(sentence.id)) next.delete(sentence.id);
                              else next.add(sentence.id);
                              return next;
                            })
                          }
                          className="text-muted-foreground"
                        >
                          {koreanHiddenIds.has(sentence.id) ? <Eye className="mr-1 h-4 w-4" /> : <EyeOff className="mr-1 h-4 w-4" />}
                          {koreanHiddenIds.has(sentence.id) ? "한글 보기" : "한글 숨기기"}
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => handleToggleFavorite(sentence.id, sentence.is_favorite)}
                          className={sentence.is_favorite ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-amber-500"}
                        >
                          <Star className={`mr-1 h-4 w-4 ${sentence.is_favorite ? "fill-current" : ""}`} />
                          즐겨찾기
                        </Button>
                      </div>

                      {practiceTotal(sentence) > 0 ? (
                        <span className="bg-success/10 text-success flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                          <Check size={11} />
                          연습 {practiceTotal(sentence)}회
                        </span>
                      ) : (
                        <span className="bg-accent-orange/10 text-accent-orange flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                          <X size={11} />
                          미연습
                        </span>
                      )}
                    </div>

                    {koreanHiddenIds.has(sentence.id) ? (
                      <p className="text-muted-foreground text-lg font-semibold select-none">한글 숨김</p>
                    ) : (
                      <p className="text-lg font-semibold">{sentence.korean_text}</p>
                    )}
                    {revealedIds.has(sentence.id) && <p className="text-brand text-lg font-medium">{sentence.english_text}</p>}

                    {sentence.note && notesShownIds.has(sentence.id) && (
                      <div className="bg-muted/50 text-muted-foreground flex gap-2 rounded-lg px-3 py-2 text-sm">
                        <StickyNote className="mt-0.5 h-4 w-4 shrink-0" />
                        <p className="whitespace-pre-wrap">{sentence.note}</p>
                      </div>
                    )}

                    {sentence.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {sentence.tags.map((t) => (
                          // 읽기 전용 라벨 — 태그 필터 토글은 상단 태그 칩 줄에서만 한다
                          <Badge key={t} variant="secondary" className={tagColorClass(t)}>
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="text-muted-foreground flex items-center gap-3 text-xs">
                      <span className="text-foreground/60 flex items-center gap-1" title="정답 횟수">
                        <Check className="h-3.5 w-3.5" />
                        정답
                      </span>
                      <span className="flex items-center gap-1" title="스피킹 정답 횟수">
                        <Mic className="h-3.5 w-3.5" />
                        {sentence.speech_count}회
                      </span>
                      <span className="flex items-center gap-1" title="쓰기 정답 횟수">
                        <Keyboard className="h-3.5 w-3.5" />
                        {sentence.text_count}회
                      </span>
                      <span className="text-foreground/70 flex items-center gap-1 font-medium" title="총 정답 횟수">
                        합계 {sentence.speech_count + sentence.text_count}회
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {speechSupported && (
                        <Button
                          variant={isListening ? "destructive" : "outline"}
                          size="sm"
                          disabled={(listeningId !== null && !isListening) || busyPlaying || isEditing || (writingId !== null && !isWriting)}
                          onClick={() => {
                            if (isListening && recognitionRef.current) {
                              recognitionRef.current.abort();
                              setListeningId(null);
                            } else {
                              startRecognition(sentence.id, sentence.english_text);
                            }
                          }}
                        >
                          {isListening ? (
                            <>
                              <MicOff className="mr-1 h-4 w-4" />
                              중지
                            </>
                          ) : (
                            <>
                              <Mic className="mr-1 h-4 w-4" />
                              말하기
                            </>
                          )}
                        </Button>
                      )}

                      <Button
                        variant={isWriting ? "destructive" : "outline"}
                        size="sm"
                        disabled={(writingId !== null && !isWriting) || busyPlaying || isEditing || (listeningId !== null && !isListening)}
                        onClick={() => {
                          if (isWriting) {
                            setWritingId(null);
                            setTextInput("");
                          } else {
                            if (recognitionRef.current) {
                              recognitionRef.current.abort();
                              setListeningId(null);
                            }
                            setWritingId(sentence.id);
                            setTextInput("");
                          }
                        }}
                      >
                        <Keyboard className="mr-1 h-4 w-4" />
                        {isWriting ? "닫기" : "쓰기"}
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isBusy}
                        onClick={() =>
                          setRevealedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(sentence.id)) next.delete(sentence.id);
                            else next.add(sentence.id);
                            return next;
                          })
                        }
                        className="text-muted-foreground"
                      >
                        {revealedIds.has(sentence.id) ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
                        {revealedIds.has(sentence.id) ? "정답 숨기기" : "정답 보기"}
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isBusy || !sentence.note}
                        onClick={() =>
                          setNotesShownIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(sentence.id)) next.delete(sentence.id);
                            else next.add(sentence.id);
                            return next;
                          })
                        }
                        className={
                          !sentence.note
                            ? "text-muted-foreground/40"
                            : notesShownIds.has(sentence.id)
                              ? "text-brand"
                              : "text-foreground hover:text-brand"
                        }
                      >
                        <StickyNote className="mr-1 h-4 w-4" />
                        메모
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => startEditing(sentence)}
                        className="text-muted-foreground hover:text-brand"
                      >
                        <Pencil className="mr-1 h-4 w-4" />
                        편집
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isBusy || isDeleting}
                              className="text-muted-foreground hover:text-destructive"
                            />
                          }
                        >
                          {isDeleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
                          삭제
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>문장 삭제</AlertDialogTitle>
                            <AlertDialogDescription>이 문장을 삭제하시겠습니까? 삭제하면 되돌릴 수 없습니다.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>취소</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(sentence.id)}
                              className="bg-destructive hover:bg-destructive/90 text-white"
                            >
                              삭제
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>

                    {isListening && (
                      <p className="text-muted-foreground text-center text-sm" aria-live="polite">
                        <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
                        듣는 중...
                      </p>
                    )}

                    {isWriting && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleTextSubmit(sentence.id, sentence.english_text);
                        }}
                        className="flex gap-2 pt-1"
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
                          disabled={isPending}
                          className="h-9 flex-1"
                        />
                        <Button type="submit" variant="brand" size="sm" disabled={!textInput.trim() || isPending}>
                          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "제출"}
                        </Button>
                      </form>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {totalPages > 1 && (
        <nav className="flex flex-wrap items-center justify-center gap-1 pt-2" aria-label="페이지 이동">
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)} aria-label="이전 페이지">
            <ChevronLeft className="h-4 w-4" />
            이전
          </Button>
          {getPageWindow(currentPage, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="text-muted-foreground px-2 text-sm">
                …
              </span>
            ) : (
              <Button
                key={p}
                variant={p === currentPage ? "brand" : "outline"}
                size="sm"
                aria-current={p === currentPage ? "page" : undefined}
                aria-label={`${p}페이지로`}
                onClick={() => goToPage(p)}
              >
                {p}
              </Button>
            ),
          )}
          <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => goToPage(currentPage + 1)} aria-label="다음 페이지">
            다음
            <ChevronRight className="h-4 w-4" />
          </Button>
        </nav>
      )}
    </div>
  );
}
