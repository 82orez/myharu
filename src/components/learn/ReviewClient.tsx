"use client";

import { useState, useCallback, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Volume2, Trash2, Loader2, Eye, EyeOff, Star } from "lucide-react";
import { deleteSentence, toggleFavorite, type Sentence } from "@/app/(learn)/learn/review/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

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
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

      {initialError && (
        <p className="text-sm text-destructive" role="alert">
          {initialError}
        </p>
      )}

      {sentences.length === 0 && !initialError && <p className="py-12 text-center text-muted-foreground">저장된 문장이 없습니다.</p>}

      <div className="flex flex-col gap-4">
        {sentences.map((sentence, index) => {
          const isPlaying = playingId === sentence.id;
          const isDeleting = deletingId === sentence.id;
          const isRemoving = removingId === sentence.id;
          const busyPlaying = playingId !== null;

          return (
            <Card
              key={sentence.id}
              className={`animate-in fade-in slide-in-from-bottom-2 fill-mode-both ${isRemoving ? "animate-out fade-out slide-out-to-left fill-mode-forwards duration-300" : ""}`}
              style={{ animationDelay: isRemoving ? "0ms" : `${Math.min(index, 5) * 100}ms`, animationDuration: isRemoving ? "300ms" : "400ms" }}>
              <CardContent className="flex flex-col gap-3 pt-6">
                <p className="text-lg font-semibold">{sentence.korean_text}</p>
                {revealedIds.has(sentence.id) && <p className="text-sm text-muted-foreground">{sentence.english_text}</p>}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {sentence.audio_url && (
                    <Button variant="outline" size="sm" disabled={busyPlaying && !isPlaying} onClick={() => playAudio(sentence.id, sentence.audio_url)}>
                      {isPlaying ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Volume2 className="mr-1 h-4 w-4" />}
                      듣기
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyPlaying}
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
                    disabled={busyPlaying}
                    onClick={() => handleToggleFavorite(sentence.id, sentence.is_favorite)}
                    className={sentence.is_favorite ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-amber-500"}>
                    <Star className={`mr-1 h-4 w-4 ${sentence.is_favorite ? "fill-current" : ""}`} />
                    즐겨찾기
                  </Button>

                  <Button variant="ghost" size="sm" disabled={busyPlaying || isDeleting} onClick={() => handleDelete(sentence.id)} className="text-muted-foreground hover:text-destructive">
                    {isDeleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
                    삭제
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
