"use client";

import { useState, useCallback, useRef, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Volume2, Mic, MicOff, Trash2, Check, X, Loader2, Eye, EyeOff, Trophy, Star } from "lucide-react";
import { deleteSentence, toggleFavorite, type Sentence } from "@/app/(learn)/learn/review/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { textsMatch } from "@/lib/normalize-text";
import { toast } from "sonner";

type SpeechResult = { status: "correct" | "incorrect"; recognizedText: string } | { status: "idle" };

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
  const [results, setResults] = useState<Record<string, SpeechResult>>({});
  const [listeningId, setListeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    setSpeechSupported("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  }, []);

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

  const attemptedCount = Object.values(results).filter((r) => r.status === "correct" || r.status === "incorrect").length;
  const correctCount = Object.values(results).filter((r) => r.status === "correct").length;
  const accuracyPercent = attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;
  const allAttempted = sentences.length > 0 && attemptedCount === sentences.length;

  const handleDateChange = (date: string) => {
    if (date) {
      router.push(`/learn/review?date=${date}`);
    } else {
      router.push("/learn/review");
    }
  };

  const playAudio = useCallback((audioUrl: string) => {
    const audio = new Audio(audioUrl);
    audio.play().catch((err) => {
      console.error("[Audio] 재생 실패:", err);
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
        const { match, similarity } = textsMatch(recognizedText, targetText);
        console.log("[Speech] 원문:", targetText);
        console.log("[Speech] 인식:", recognizedText);
        console.log("[Speech] 유사도:", Math.round(similarity * 100) + "%", match ? "→ 정답" : "→ 오답");
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
      setResults((prev) => ({ ...prev, [sentenceId]: { status: "idle" } }));
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
            setResults((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
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
        <h1 className="text-2xl font-extrabold">복습</h1>
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

      {/* 세션 통계 */}
      {sentences.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">총 {sentences.length}문장</Badge>
          {attemptedCount > 0 && (
            <>
              <Badge variant="secondary">연습 {attemptedCount}문장</Badge>
              <Badge variant={accuracyPercent >= 80 ? "default" : "secondary"} className={accuracyPercent >= 80 ? "bg-brand text-brand-foreground" : ""}>
                정답률 {accuracyPercent}%
              </Badge>
            </>
          )}
        </div>
      )}

      {initialError && (
        <p className="text-sm text-destructive" role="alert">
          {initialError}
        </p>
      )}

      {!speechSupported && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          이 브라우저에서는 음성 인식이 지원되지 않습니다. Chrome 또는 Edge 브라우저를 사용해 주세요.
        </p>
      )}

      {sentences.length === 0 && !initialError && <p className="py-12 text-center text-muted-foreground">저장된 문장이 없습니다.</p>}

      {/* 세션 완료 배너 */}
      {allAttempted && (
        <div className="animate-in fade-in zoom-in-95 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <Trophy className="h-5 w-5 text-green-600" />
          <p className="text-sm font-medium text-green-700">수고했어요! 모든 문장을 연습했습니다.</p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {sentences.map((sentence, index) => {
          const result = results[sentence.id];
          const isListening = listeningId === sentence.id;
          const isDeleting = deletingId === sentence.id;
          const isRemoving = removingId === sentence.id;

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
                    <Button variant="outline" size="sm" onClick={() => playAudio(sentence.audio_url)}>
                      <Volume2 className="mr-1 h-4 w-4" />
                      듣기
                    </Button>
                  )}

                  {speechSupported && (
                    <Button
                      variant={isListening ? "destructive" : "outline"}
                      size="sm"
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
                    onClick={() => handleToggleFavorite(sentence.id, sentence.is_favorite)}
                    className={sentence.is_favorite ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-amber-500"}>
                    <Star className={`mr-1 h-4 w-4 ${sentence.is_favorite ? "fill-current" : ""}`} />
                    즐겨찾기
                  </Button>

                  <Button variant="ghost" size="sm" onClick={() => handleDelete(sentence.id)} disabled={isDeleting} className="text-muted-foreground hover:text-destructive">
                    {isDeleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
                    삭제
                  </Button>
                </div>

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
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
