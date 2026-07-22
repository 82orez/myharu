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
  Search,
  Tag,
  X,
  Plus,
  StickyNote,
} from "lucide-react";
import { deleteSentence, toggleFavorite, updateSentence, type Sentence } from "@/app/(learn)/learn/review/actions";
import { generateAudio } from "@/app/(learn)/learn/input/actions";
import { recordPracticeResult } from "@/app/(learn)/learn/review/gamification-actions";
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
import { textsMatch, SIMILARITY_THRESHOLD, STRICT_SIMILARITY_THRESHOLD } from "@/lib/normalize-text";
import { tagColorClass } from "@/lib/tag-color";
import { useSelectedVoice } from "@/hooks/use-selected-voice";
import { toast } from "sonner";

type SortMode = "latest" | "oldest" | "alpha";

// created_at(ISO) → KST 날짜 문자열(YYYY-MM-DD)
const kstDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

// 문장의 총 정답 연습 횟수(스피킹 + 쓰기). 0이면 "미연습"
const practiceTotal = (s: Sentence) => s.speech_count + s.text_count;

type EditState = {
  id: string;
  englishText: string;
  koreanText: string;
  originalEnglish: string;
  regenAudio: boolean;
  tags: string[];
  note: string;
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
  const [voice] = useSelectedVoice();
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  // "" = 전체 일자, 그 외에는 입력일(YYYY-MM-DD)
  const [dayFilter, setDayFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [sort, setSort] = useState<SortMode>("latest");
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
        setSentences((prev) =>
          prev.map((s) => (s.id === sentenceId ? { ...s, text_count: s.text_count + (match ? 1 : 0) } : s)),
        );
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
        startTransition(async () => {
          const result = await recordPracticeResult(sentenceId, match, "speech");
          if (result.error) {
            toast.error(result.error);
            return;
          }
          triggerFeedback(sentenceId, match ? "correct" : "incorrect", result.xpEarned);
          setSentences((prev) =>
            prev.map((s) => (s.id === sentenceId ? { ...s, speech_count: s.speech_count + (match ? 1 : 0) } : s)),
          );
          if (match) {
            toast.success("정확합니다!");
          } else {
            toast.error("다시 시도하세요.", { description: `인식된 문장: "${recognizedText}"` });
          }
        });
      };

      recognition.onerror = (event: any) => {
        // "aborted"(사용자가 중지)·"no-speech"(무음)는 정상/무해 케이스라 로깅 제외
        if (event.error !== "aborted" && event.error !== "no-speech") {
          console.error("[Speech Recognition] 오류:", event.error);
        }
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
    [speechSupported, startTransition, triggerFeedback, writingId, speechStrict],
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
      note: sentence.note,
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

      const result = await updateSentence(editing.id, editing.englishText, editing.koreanText, audioBase64, editing.tags, editing.note);

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

  // 문장 삭제 등으로 선택한 날짜가 사라지면 전체로 간주
  const activeDay = dayMeta.dates.includes(dayFilter) ? dayFilter : "";

  // 전체 문장의 distinct 태그(태그 필터 칩 / 편집 자동완성용)
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const s of sentences) for (const t of s.tags) set.add(t);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [sentences]);

  const toggleTag = (t: string) => setTagFilters((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  // 필터 결합: 입력일 → 즐겨찾기 → 태그(다중 AND) → 검색(문장·뜻)
  const byDay = activeDay ? sentences.filter((s) => kstDate(s.created_at) === activeDay) : sentences;
  const q = search.trim().toLowerCase();
  const pool = byDay.filter((s) => {
    if (favoriteOnly && !s.is_favorite) return false;
    if (tagFilters.length > 0 && !tagFilters.every((t) => s.tags.includes(t))) return false;
    if (q && !`${s.english_text} ${s.korean_text}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const visibleSentences = pool.slice().sort((a, b) => {
    if (sort === "alpha") return a.english_text.localeCompare(b.english_text, "en");
    const cmp = a.created_at.localeCompare(b.created_at);
    return sort === "oldest" ? cmp : -cmp;
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-center text-2xl font-extrabold">문장 목록</h1>

      {sentences.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {allTags.length > 0 && (
              <>
                <Button variant={tagFilters.length === 0 ? "brand" : "outline"} size="sm" onClick={() => setTagFilters([])}>
                  <Tag className="mr-1 h-4 w-4" />
                  전체 {pool.length}
                </Button>
                {allTags.map((t) => (
                  <Button key={t} variant={tagFilters.includes(t) ? "brand" : "outline"} size="sm" onClick={() => toggleTag(t)}>
                    {t}
                  </Button>
                ))}
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              aria-pressed={favoriteOnly}
              onClick={() => setFavoriteOnly((v) => !v)}
              className={favoriteOnly ? "border-amber-500 bg-amber-500/10 text-amber-600" : "text-amber-500"}>
              <Star className={`mr-1 h-4 w-4 ${favoriteOnly ? "fill-current" : ""}`} />
              즐겨찾기
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Button variant={showFind || search ? "brand" : "outline"} size="sm" onClick={() => setShowFind((v) => !v)}>
                <Search className="mr-1 h-4 w-4" />
                검색
                <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${showFind ? "rotate-180" : ""}`} />
              </Button>
              {dayMeta.dates.length > 1 && (
                <select
                  value={activeDay}
                  onChange={(e) => setDayFilter(e.target.value)}
                  aria-label="입력일"
                  className="border-input bg-background ring-ring/10 focus-visible:border-ring focus-visible:ring-ring/20 h-8 rounded-md border px-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]">
                  <option value="">전체 일자</option>
                  {dayMeta.dates
                    .slice()
                    .reverse()
                    .map((d) => {
                      const [, m, day] = d.split("-");
                      return (
                        <option key={d} value={d}>
                          {`${dayMeta.dayNumber.get(d)}일차 · ${Number(m)}/${Number(day)} (${dayMeta.counts.get(d)}문장)`}
                        </option>
                      );
                    })}
                </select>
              )}
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
            <div className="relative">
              <Search size={16} className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" />
              <Input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="영어 문장/한글 뜻 검색" className="h-9 pr-9 pl-9" />
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

      {sentences.length === 0 && !initialError && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <p className="text-muted-foreground">아직 저장된 문장이 없습니다.</p>
          <Button variant="brand" nativeButton={false} render={<Link href="/learn/input" />}>
            <Plus size={16} />
            첫 문장 등록하기
          </Button>
        </div>
      )}

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
              className={`animate-in fade-in slide-in-from-bottom-2 fill-mode-both relative ${practiceTotal(sentence) > 0 ? "border-l-success border-l-2" : "border-l-accent-orange/40 border-l-2"} ${feedbackClass} ${isRemoving ? "animate-out fade-out slide-out-to-left fill-mode-forwards duration-300" : ""}`}
              style={{ animationDelay: isRemoving ? "0ms" : `${Math.min(index, 5) * 100}ms`, animationDuration: isRemoving ? "300ms" : "400ms" }}>
              {isFeedback && feedbackStatus === "correct" && feedbackXp > 0 && (
                <span className="animate-float-up text-xp-gold pointer-events-none absolute top-2 right-4 z-20 text-lg font-bold">
                  +{feedbackXp} XP
                </span>
              )}
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
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-muted-foreground text-xs">메모</Label>
                      <textarea
                        value={editing.note}
                        onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                        maxLength={1000}
                        placeholder="이 문장과 관련된 메모"
                        rows={5}
                        className="border-input bg-background ring-ring/10 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/20 flex min-h-[120px] w-full rounded-md border px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
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
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
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
                          className="text-muted-foreground">
                          {koreanHiddenIds.has(sentence.id) ? <Eye className="mr-1 h-4 w-4" /> : <EyeOff className="mr-1 h-4 w-4" />}
                          {koreanHiddenIds.has(sentence.id) ? "한글 보기" : "한글 숨기기"}
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

                      {sentence.note && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isBusy}
                          onClick={() =>
                            setNotesShownIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(sentence.id)) next.delete(sentence.id);
                              else next.add(sentence.id);
                              return next;
                            })
                          }
                          className={notesShownIds.has(sentence.id) ? "text-brand" : "text-muted-foreground hover:text-brand"}>
                          <StickyNote className="mr-1 h-4 w-4" />
                          메모
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => startEditing(sentence)}
                        className="text-muted-foreground hover:text-brand">
                        <Pencil className="mr-1 h-4 w-4" />
                        편집
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button variant="ghost" size="sm" disabled={isBusy || isDeleting} className="text-muted-foreground hover:text-destructive" />
                          }>
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
                              className="bg-destructive text-white hover:bg-destructive/90">
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
