"use client";

import { useState, useCallback, useRef, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Volume2, Trash2, Loader2, Eye, EyeOff, Star, Pencil, X, Mic, MicOff, Check } from "lucide-react";
import { deleteSentence, toggleFavorite, updateSentence, type Sentence } from "@/app/(learn)/learn/review/actions";
import { generateAudio } from "@/app/(learn)/learn/input/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { textsMatch } from "@/lib/normalize-text";
import { toast } from "sonner";

type SpeechResult = { status: "correct" | "incorrect"; recognizedText: string };

type EditState = {
  id: string;
  englishText: string;
  koreanText: string;
  originalEnglish: string;
  regenAudio: boolean;
};

export default function ReviewClient({
  initialSentences,
  initialError,
  dateFilter,
}: {
  initialSentences: Sentence[];
  initialError?: string;
  dateFilter?: string;
}) {
  const router = useRouter();
  const [sentences, setSentences] = useState(initialSentences);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, startSaving] = useTransition();
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listeningId, setListeningId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, SpeechResult>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    setSpeechSupported("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  }, []);

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

  const handleDateChange = (date: string) => {
    if (date) {
      router.push(`/learn/review?date=${date}`);
    } else {
      router.push("/learn/review");
    }
  };

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

  const startRecognition = useCallback(
    (sentenceId: string, targetText: string) => {
      if (!speechSupported) return;

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
        setResults((prev) => ({
          ...prev,
          [sentenceId]: { status: match ? "correct" : "incorrect", recognizedText },
        }));
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
    [speechSupported],
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
    setEditing({
      id: sentence.id,
      englishText: sentence.english_text,
      koreanText: sentence.korean_text,
      originalEnglish: sentence.english_text,
      regenAudio: true,
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
        const audioResult = await generateAudio(editing.englishText);
        if ("error" in audioResult) {
          toast.error(audioResult.error);
          return;
        }
        audioBase64 = audioResult.audioBase64;
      }

      const result = await updateSentence(editing.id, editing.englishText, editing.koreanText, audioBase64);

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      setSentences((prev) =>
        prev.map((s) =>
          s.id === editing.id
            ? { ...s, english_text: editing.englishText.trim(), korean_text: editing.koreanText.trim(), audio_url: result.audioUrl }
            : s,
        ),
      );
      toast.success("문장이 수정되었습니다.");
      setEditing(null);
    });
  };

  const isEditing = editing !== null;
  const isBusy = playingId !== null || isEditing || listeningId !== null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-extrabold">문장 목록</h1>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFilter ?? ""}
            onChange={(e) => handleDateChange(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2 text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:outline-none"
          />
          <Button variant="outline" onClick={() => handleDateChange(today)} className="text-sm">
            오늘
          </Button>
          {dateFilter && (
            <Button variant="ghost" onClick={() => handleDateChange("")} className="text-sm">
              전체
            </Button>
          )}
        </div>
      </div>

      {sentences.length > 0 && <p className="text-sm text-muted-foreground">총 {sentences.length}문장</p>}

      {!speechSupported && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          이 브라우저에서는 음성 인식이 지원되지 않습니다. Chrome 또는 Edge 브라우저를 사용해 주세요.
        </p>
      )}

      {initialError && (
        <p className="text-sm text-destructive" role="alert">
          {initialError}
        </p>
      )}

      {sentences.length === 0 && !initialError && <p className="py-12 text-center text-muted-foreground">저장된 문장이 없습니다.</p>}

      <div className="flex flex-col gap-4">
        {sentences.map((sentence, index) => {
          const isPlaying = playingId === sentence.id;
          const isListening = listeningId === sentence.id;
          const isDeleting = deletingId === sentence.id;
          const isRemoving = removingId === sentence.id;
          const busyPlaying = playingId !== null;
          const isThisEditing = editing?.id === sentence.id;
          const result = results[sentence.id];

          return (
            <Card
              key={sentence.id}
              className={`animate-in fade-in slide-in-from-bottom-2 fill-mode-both ${isRemoving ? "animate-out fade-out slide-out-to-left fill-mode-forwards duration-300" : ""}`}
              style={{ animationDelay: isRemoving ? "0ms" : `${Math.min(index, 5) * 100}ms`, animationDuration: isRemoving ? "300ms" : "400ms" }}>
              <CardContent className="flex flex-col gap-3 pt-6">
                {isThisEditing && editing ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs text-muted-foreground">한국어 뜻</Label>
                      <Input value={editing.koreanText} onChange={(e) => setEditing({ ...editing, koreanText: e.target.value })} maxLength={500} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs text-muted-foreground">영어 문장</Label>
                      <textarea
                        value={editing.englishText}
                        onChange={(e) => setEditing({ ...editing, englishText: e.target.value })}
                        maxLength={500}
                        className="border-input bg-background ring-ring/10 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/20 flex min-h-[60px] w-full rounded-md border px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
                      />
                    </div>
                    {editing.englishText.trim() !== editing.originalEnglish && (
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
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
                      <Button variant="brand" size="sm" onClick={handleSaveEdit} disabled={saving || (!editing.englishText.trim() || !editing.koreanText.trim())}>
                        {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                        {saving ? "저장 중..." : "저장"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-lg font-semibold">{sentence.korean_text}</p>
                    {revealedIds.has(sentence.id) && <p className="text-sm text-muted-foreground">{sentence.english_text}</p>}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {sentence.audio_url && (
                        <Button variant="outline" size="sm" disabled={(busyPlaying && !isPlaying) || isEditing || listeningId !== null} onClick={() => playAudio(sentence.id, sentence.audio_url)}>
                          {isPlaying ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Volume2 className="mr-1 h-4 w-4" />}
                          듣기
                        </Button>
                      )}

                      {speechSupported && (
                        <Button
                          variant={isListening ? "destructive" : "outline"}
                          size="sm"
                          disabled={(listeningId !== null && !isListening) || busyPlaying || isEditing}
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

                      <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => startEditing(sentence)} className="text-muted-foreground hover:text-brand">
                        <Pencil className="mr-1 h-4 w-4" />
                        편집
                      </Button>

                      <Button variant="ghost" size="sm" disabled={isBusy || isDeleting} onClick={() => handleDelete(sentence.id)} className="text-muted-foreground hover:text-destructive">
                        {isDeleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
                        삭제
                      </Button>
                    </div>

                    {isListening && (
                      <p className="text-center text-sm text-muted-foreground" aria-live="polite">
                        <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
                        듣는 중...
                      </p>
                    )}

                    {result && result.status === "correct" && (
                      <div className="animate-in fade-in slide-in-from-top-1 flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                        <Check className="h-4 w-4" />
                        정확합니다!
                      </div>
                    )}

                    {result && result.status === "incorrect" && (
                      <div className="animate-in fade-in slide-in-from-top-1 flex flex-col gap-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                        <div className="flex items-center gap-2">
                          <X className="h-4 w-4" />
                          다시 시도하세요.
                        </div>
                        <p className="text-xs text-red-500">인식된 문장: &quot;{result.recognizedText}&quot;</p>
                      </div>
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
