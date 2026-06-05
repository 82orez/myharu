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
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  Tag,
  X,
} from "lucide-react";
import { deleteSentence, toggleFavorite, updateSentence, type Sentence } from "@/app/(learn)/learn/review/actions";
import { generateAudio } from "@/app/(learn)/learn/input/actions";
import { recordPracticeResult } from "@/app/(learn)/learn/review/gamification-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import TagPicker from "@/components/learn/TagPicker";
import { textsMatch } from "@/lib/normalize-text";
import { tagColorClass } from "@/lib/tag-color";
import { useSelectedVoice } from "@/hooks/use-selected-voice";
import { toast } from "sonner";

type SortMode = "latest" | "oldest" | "alpha";

// created_at(ISO) → KST 날짜 문자열(YYYY-MM-DD)
const kstDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

// 스테퍼 기본 일차: 오늘 입력이 있으면 오늘, 없으면 가장 최신 입력일 (둘 다 없으면 "")
function computeDefaultDay(sents: Sentence[]): string {
  const dates = Array.from(new Set(sents.map((s) => kstDate(s.created_at)))).sort();
  if (dates.length === 0) return "";
  const today = kstDate(new Date().toISOString());
  return dates.includes(today) ? today : dates[dates.length - 1];
}

type EditState = {
  id: string;
  englishText: string;
  koreanText: string;
  originalEnglish: string;
  regenAudio: boolean;
  tags: string[];
};

export default function ReviewClient({
  initialSentences,
  initialError,
  initialPresets = [],
}: {
  initialSentences: Sentence[];
  initialError?: string;
  initialPresets?: string[];
}) {
  const [sentences, setSentences] = useState(initialSentences);
  const [presets, setPresets] = useState<string[]>(initialPresets);
  const [voice] = useSelectedVoice();
  const [filter, setFilter] = useState<"all" | "memorized" | "unmemorized">("all");
  const [showAll, setShowAll] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>(() => computeDefaultDay(initialSentences));
  const [search, setSearch] = useState("");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [sort, setSort] = useState<SortMode>("latest");
  const [showFind, setShowFind] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, startSaving] = useTransition();
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listeningId, setListeningId] = useState<string | null>(null);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<"correct" | "incorrect" | null>(null);
  const [feedbackXp, setFeedbackXp] = useState<number>(0);
  const [writingId, setWritingId] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const feedbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (writingId) textInputRef.current?.focus();
  }, [writingId]);

  useEffect(() => {
    setSpeechSupported("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  }, []);

  const playAudio = useCallback((sentenceId: string, audioUrl: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    setPlayingId(sentenceId);
    audio.onended = () => {
      setPlayingId(null);
      audioRef.current = null;
    };
    audio.onerror = () => {
      setPlayingId(null);
      audioRef.current = null;
    };
    audio.play().catch((err) => {
      console.error("[Audio] 재생 실패:", err);
      setPlayingId(null);
      audioRef.current = null;
    });
  }, []);

  const triggerFeedback = useCallback((sentenceId: string, status: "correct" | "incorrect", xp: number) => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setFeedbackId(sentenceId);
    setFeedbackStatus(status);
    setFeedbackXp(xp);
    feedbackTimerRef.current = setTimeout(() => {
      setFeedbackId(null);
      setFeedbackStatus(null);
      setFeedbackXp(0);
    }, 1500);
  }, []);

  const handleTextSubmit = useCallback(
    (sentenceId: string, targetText: string) => {
      const trimmed = textInput.trim();
      if (!trimmed) return;
      const { match } = textsMatch(trimmed, targetText);
      startTransition(async () => {
        const result = await recordPracticeResult(sentenceId, match, "text");
        if (result.error) {
          toast.error(result.error);
          return;
        }
        triggerFeedback(sentenceId, match ? "correct" : "incorrect", result.xpEarned);
        if (match) {
          setSentences((prev) => prev.map((s) => (s.id === sentenceId ? { ...s, is_memorized: true } : s)));
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
        const { match } = textsMatch(recognizedText, targetText);
        startTransition(async () => {
          const result = await recordPracticeResult(sentenceId, match, "speech");
          if (result.error) {
            toast.error(result.error);
            return;
          }
          triggerFeedback(sentenceId, match ? "correct" : "incorrect", result.xpEarned);
          if (match) {
            setSentences((prev) => prev.map((s) => (s.id === sentenceId ? { ...s, is_memorized: true } : s)));
            toast.success("정확합니다!");
          } else {
            toast.error("다시 시도하세요.", { description: `인식된 문장: "${recognizedText}"` });
          }
        });
      };

      recognition.onerror = (event: any) => {
        console.error("[Speech Recognition] 오류:", event.error);
        if (event.error === "not-allowed") {
          toast.warning("마이크 접근 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해 주세요.");
        }
        setListeningId(null);
      };

      recognition.onend = () => {
        setListeningId(null);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      setListeningId(sentenceId);
      recognition.start();
    },
    [speechSupported, startTransition, triggerFeedback, writingId],
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
      if (!confirm("이 문장을 삭제하시겠습니까?")) return;

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

  const startEditing = (sentence: Sentence) => {
    if (writingId !== null) {
      setWritingId(null);
      setTextInput("");
    }
    setEditing({
      id: sentence.id,
      englishText: sentence.english_text,
      koreanText: sentence.korean_text,
      originalEnglish: sentence.english_text,
      regenAudio: true,
      tags: sentence.tags,
    });
  };

  const cancelEditing = () => setEditing(null);

  const handleSaveEdit = () => {
    if (!editing) return;

    const englishChanged = editing.englishText.trim() !== editing.originalEnglish;
    const needRegen = englishChanged && editing.regenAudio;

    startSaving(async () => {
      let audioBase64: string | undefined;

      if (needRegen) {
        const audioResult = await generateAudio(editing.englishText, voice);
        if ("error" in audioResult) {
          toast.error(audioResult.error);
          return;
        }
        audioBase64 = audioResult.audioBase64;
      }

      const result = await updateSentence(editing.id, editing.englishText, editing.koreanText, audioBase64, editing.tags);

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
              }
            : s,
        ),
      );
      toast.success("문장이 수정되었습니다.");
      setEditing(null);
    });
  };

  const isEditing = editing !== null;
  const isBusy = playingId !== null || isEditing || listeningId !== null || writingId !== null;

  // 입력 날짜(KST)별 일차 메타: 가장 이른 날 = 1일차, 날짜별 문장 수 집계
  const dayMeta = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sentences) {
      const d = kstDate(s.created_at);
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    const dates = Array.from(counts.keys()).sort();
    const dayNumber = new Map<string, number>();
    dates.forEach((d, i) => dayNumber.set(d, i + 1));
    return { counts, dayNumber, dates };
  }, [sentences]);

  const todayKst = kstDate(new Date().toISOString());

  const ascDates = dayMeta.dates;
  const validSelected = ascDates.includes(selectedDay) ? selectedDay : (ascDates[ascDates.length - 1] ?? "");
  const idx = ascDates.indexOf(validSelected);

  // 오늘 입력한 문장이 없어 자동으로 마지막(최신) 일차를 보고 있는 상태: 안내 배너 표시
  const noTodayInput = ascDates.length > 0 && !ascDates.includes(todayKst);
  const showNoTodayNotice = noTodayInput && !showAll && validSelected === ascDates[ascDates.length - 1];

  const goPrev = () => {
    setShowAll(false);
    if (idx > 0) setSelectedDay(ascDates[idx - 1]);
  };
  const goNext = () => {
    setShowAll(false);
    if (idx < ascDates.length - 1) setSelectedDay(ascDates[idx + 1]);
  };

  // 전체 문장의 distinct 태그(태그 필터 칩 / 편집 자동완성용)
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const s of sentences) for (const t of s.tags) set.add(t);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [sentences]);

  const toggleTag = (t: string) => setTagFilters((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  // 필터 결합: 일차 → 검색(문장·뜻) → 태그(다중 AND) → (상태)
  const byDay = showAll ? sentences : sentences.filter((s) => kstDate(s.created_at) === validSelected);
  const q = search.trim().toLowerCase();
  const pool = byDay.filter((s) => {
    if (tagFilters.length > 0 && !tagFilters.every((t) => s.tags.includes(t))) return false;
    if (q && !`${s.english_text} ${s.korean_text}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const memorizedCount = pool.filter((s) => s.is_memorized).length;
  const unmemorizedCount = pool.length - memorizedCount;
  const filtered =
    filter === "memorized" ? pool.filter((s) => s.is_memorized) : filter === "unmemorized" ? pool.filter((s) => !s.is_memorized) : pool;
  const visibleSentences = filtered.slice().sort((a, b) => {
    if (sort === "alpha") return a.english_text.localeCompare(b.english_text, "en");
    const cmp = a.created_at.localeCompare(b.created_at);
    return sort === "oldest" ? cmp : -cmp;
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-center text-2xl font-extrabold">문장 목록</h1>

      {sentences.length > 0 && (
        <div className="flex flex-col gap-3">
          {showNoTodayNotice && (
            <div className="border-brand/20 bg-brand/5 rounded-lg border p-4 text-center">
              <p className="text-muted-foreground mb-3 text-sm">오늘 학습할 문장이 아직 없습니다. 최근 학습일차를 표시하고 있어요.</p>
              <Button variant="brand" size="sm" nativeButton={false} render={<Link href="/learn/input" />}>
                문장 입력하러 가기
              </Button>
            </div>
          )}
          {ascDates.length > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant={showAll ? "brand" : "outline"} size="sm" onClick={() => setShowAll(true)}>
                전체 일차
              </Button>
              <Button
                variant={!showAll && validSelected === todayKst ? "brand" : "outline"}
                size="sm"
                disabled={!ascDates.includes(todayKst)}
                onClick={() => {
                  setShowAll(false);
                  setSelectedDay(todayKst);
                }}>
                오늘
              </Button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={idx <= 0}
                  aria-label="이전 일차"
                  className="hover:bg-muted text-muted-foreground flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-30">
                  <ChevronLeft size={18} />
                </button>
                <span className={`min-w-[11rem] text-center text-base font-medium tabular-nums ${showAll ? "text-muted-foreground/60" : ""}`}>
                  {(() => {
                    const [, m, day] = validSelected.split("-");
                    return `${dayMeta.dayNumber.get(validSelected)}일차 (${validSelected === todayKst ? "오늘, " : ""}${Number(m)}/${Number(day)}) · ${dayMeta.counts.get(validSelected)}문장`;
                  })()}
                </span>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={idx >= ascDates.length - 1}
                  aria-label="다음 일차"
                  className="hover:bg-muted text-muted-foreground flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-30">
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant={filter === "all" ? "brand" : "outline"} size="sm" onClick={() => setFilter("all")}>
              전체 {pool.length}
            </Button>
            <Button
              variant={filter === "memorized" ? "success" : "outline"}
              size="sm"
              onClick={() => setFilter("memorized")}
              className={filter === "memorized" ? "" : "text-success"}>
              <Check className="mr-1 h-4 w-4" />
              암기 완료 {memorizedCount}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilter("unmemorized")}
              className={filter === "unmemorized" ? "border-streak-orange bg-streak-orange/10 text-streak-orange" : "text-streak-orange"}>
              <Circle className="mr-1 h-4 w-4" />
              미학습 {unmemorizedCount}
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Button variant={showFind || search || tagFilters.length > 0 ? "brand" : "outline"} size="sm" onClick={() => setShowFind((v) => !v)}>
                <Search className="mr-1 h-4 w-4" />
                검색·태그
                <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${showFind ? "rotate-180" : ""}`} />
              </Button>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortMode)}
                aria-label="정렬"
                className="border-input bg-background ring-ring/10 focus-visible:border-ring focus-visible:ring-ring/20 h-8 rounded-md border px-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]">
                <option value="latest">최신순</option>
                <option value="oldest">오래된순</option>
                <option value="alpha">가나다순(A–Z)</option>
              </select>
            </div>
          </div>

          {showFind && (
            <>
              <div className="relative">
                <Search size={16} className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" />
                <Input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="문장·뜻 검색" className="h-9 pr-9 pl-9" />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="검색어 지우기"
                    className="hover:bg-muted text-muted-foreground absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md transition-colors">
                    <X size={14} />
                  </button>
                )}
              </div>

              {allTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Tag size={14} className="text-muted-foreground mr-0.5" />
                  <Button variant={tagFilters.length === 0 ? "brand" : "outline"} size="sm" className="h-7" onClick={() => setTagFilters([])}>
                    전체
                  </Button>
                  {allTags.map((t) => (
                    <Button key={t} variant={tagFilters.includes(t) ? "brand" : "outline"} size="sm" className="h-7" onClick={() => toggleTag(t)}>
                      {t}
                    </Button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!speechSupported && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          이 브라우저에서는 음성 인식이 지원되지 않습니다. Chrome 또는 Edge 브라우저를 사용해 주세요.
        </p>
      )}

      {initialError && (
        <p className="text-destructive text-sm" role="alert">
          {initialError}
        </p>
      )}

      {sentences.length === 0 && !initialError && <p className="text-muted-foreground py-12 text-center">저장된 문장이 없습니다.</p>}

      {sentences.length > 0 && visibleSentences.length === 0 && (
        <p className="text-muted-foreground py-12 text-center">선택한 조건에 해당하는 문장이 없습니다.</p>
      )}

      <div className="flex flex-col gap-4">
        {visibleSentences.map((sentence, index) => {
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
              className={`animate-in fade-in slide-in-from-bottom-2 fill-mode-both relative ${sentence.is_memorized ? "border-l-success border-l-2" : "border-l-streak-orange/40 border-l-2"} ${feedbackClass} ${isRemoving ? "animate-out fade-out slide-out-to-left fill-mode-forwards duration-300" : ""}`}
              style={{ animationDelay: isRemoving ? "0ms" : `${Math.min(index, 5) * 100}ms`, animationDuration: isRemoving ? "300ms" : "400ms" }}>
              {!isThisEditing &&
                (sentence.is_memorized ? (
                  <span className="bg-success/10 text-success absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                    <Check size={11} />
                    암기 완료
                  </span>
                ) : (
                  <span className="bg-streak-orange/10 text-streak-orange absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                    <Circle size={11} />
                    미학습
                  </span>
                ))}
              {isFeedback && feedbackStatus === "correct" && feedbackXp > 0 && (
                <span className="animate-float-up text-xp-gold pointer-events-none absolute top-2 right-4 z-20 text-lg font-bold">
                  +{feedbackXp} XP
                </span>
              )}
              <CardContent className="flex flex-col gap-3 pt-6">
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
                      />
                    </div>
                    {editing.englishText.trim() !== editing.originalEnglish && (
                      <label className="text-muted-foreground flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editing.regenAudio}
                          onChange={(e) => setEditing({ ...editing, regenAudio: e.target.checked })}
                          className="accent-brand h-4 w-4 rounded"
                        />
                        음성 재생성
                      </label>
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={cancelEditing} disabled={saving}>
                        취소
                      </Button>
                      <Button
                        variant="brand"
                        size="sm"
                        onClick={handleSaveEdit}
                        disabled={saving || !editing.englishText.trim() || !editing.koreanText.trim()}>
                        {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                        {saving ? "저장 중..." : "저장"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-lg font-semibold">{sentence.korean_text}</p>
                    {revealedIds.has(sentence.id) && <p className="text-muted-foreground text-sm">{sentence.english_text}</p>}

                    {sentence.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {sentence.tags.map((t) => (
                          <Badge
                            key={t}
                            variant="secondary"
                            render={<button type="button" onClick={() => toggleTag(t)} />}
                            className={`${tagColorClass(t)} cursor-pointer ${tagFilters.includes(t) ? "ring-foreground/40 ring-2" : ""}`}>
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {sentence.audio_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={(busyPlaying && !isPlaying) || isEditing || listeningId !== null}
                          onClick={() => playAudio(sentence.id, sentence.audio_url)}>
                          {isPlaying ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Volume2 className="mr-1 h-4 w-4" />}
                          듣기
                        </Button>
                      )}

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
                          }}>
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
                        }}>
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
                        className="text-muted-foreground">
                        {revealedIds.has(sentence.id) ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
                        {revealedIds.has(sentence.id) ? "정답 숨기기" : "정답 보기"}
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => handleToggleFavorite(sentence.id, sentence.is_favorite)}
                        className={sentence.is_favorite ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-amber-500"}>
                        <Star className={`mr-1 h-4 w-4 ${sentence.is_favorite ? "fill-current" : ""}`} />
                        즐겨찾기
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => startEditing(sentence)}
                        className="text-muted-foreground hover:text-brand">
                        <Pencil className="mr-1 h-4 w-4" />
                        편집
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isBusy || isDeleting}
                        onClick={() => handleDelete(sentence.id)}
                        className="text-muted-foreground hover:text-destructive">
                        {isDeleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
                        삭제
                      </Button>
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
                        className="flex gap-2 pt-1">
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
    </div>
  );
}
