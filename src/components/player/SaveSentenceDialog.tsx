"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import TagPicker from "@/components/learn/TagPicker";
import { saveSentence } from "@/app/(learn)/learn/input/actions";
import { usePlayerStore } from "@/store/playerStore";
import { extractRegionToMp3Blob } from "@/lib/audioExport";
import { prepareAudioBuffer } from "@/lib/audio-upload";
import { MAX_AUDIO_BYTES } from "@/lib/audio-formats";
import { findCueText, type SubTrack } from "@/lib/subtitles";
import { DEFAULT_STT_MODEL, STT_MODELS, getSttModel, setSttModel, type SttModelId } from "@/lib/stt-models";
import { fmtTime } from "@/lib/time";
import { cn } from "@/lib/utils";

// Vercel 서버리스 요청 본문 한계는 4.5MB로, next.config.ts의 bodySizeLimit으로는 넘을 수 없다.
// base64는 원본보다 ~33% 크므로 안전선을 그 아래로 잡고 경고만 띄운다(로컬에서는 통과하므로 막지 않는다).
const SAFE_PAYLOAD_BYTES = 3 * 1024 * 1024;

const MAX_NOTE = 1000;

// 자막 큐는 두 줄로 접혀 오는 경우가 많다 — 한 문장으로 펴서 넣는다
const flatten = (s: string) => s.replace(/\s+/g, " ").trim();

// 켜진 자막 트랙에서 영어/한국어를 고른다.
// lang(파일명에서 뽑은 BCP-47)이 있으면 그걸 믿고, 없으면 첫 트랙=영어·두 번째=한국어로 둔다.
// 어느 쪽이든 사용자가 폼에서 고칠 수 있으므로 추측이 빗나가도 손해가 없다.
function prefillFromSubs(subs: SubTrack[], t: number): { english: string; korean: string } {
  const enabled = subs.filter((s) => s.enabled && s.cues.length > 0);
  if (enabled.length === 0) return { english: "", korean: "" };

  const taggedEn = enabled.find((s) => s.lang?.startsWith("en"));
  const taggedKo = enabled.find((s) => s.lang?.startsWith("ko"));

  const enTrack = taggedEn ?? enabled.find((s) => s !== taggedKo) ?? null;
  const koTrack = taggedKo ?? enabled.find((s) => s !== enTrack) ?? null;

  return {
    english: enTrack ? flatten(findCueText(enTrack.cues, t)) : "",
    korean: koTrack ? flatten(findCueText(koTrack.cues, t)) : "",
  };
}

type Clip = { blob: Blob; base64: string; stats: { loudnessDb: number; peakDb: number } | null; bytes: number; url: string };

export default function SaveSentenceDialog({
  open,
  onOpenChange,
  kbps,
  initialPresets = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kbps: number;
  initialPresets?: string[];
}) {
  const mediaUrl = usePlayerStore((s) => s.mediaUrl);
  const fileName = usePlayerStore((s) => s.fileName);
  const loopA = usePlayerStore((s) => s.loopA);
  const loopB = usePlayerStore((s) => s.loopB);
  const subs = usePlayerStore((s) => s.subs);

  const [english, setEnglish] = useState("");
  const [korean, setKorean] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [presets, setPresets] = useState<string[]>(initialPresets);

  const [clip, setClip] = useState<Clip | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [clipError, setClipError] = useState<string | null>(null);
  const [sttPending, setSttPending] = useState(false);
  // 인식 모델은 기기별 설정 — SSR 안전하게 기본값으로 시작해 mount 후 저장값으로 보정한다
  const [sttModel, setSttModelState] = useState<SttModelId>(DEFAULT_STT_MODEL);
  const [saving, startSaving] = useTransition();

  // 스테이징된 blob URL은 항상 1개만 살아 있게 한다(교체·닫기·언마운트에서 revoke)
  const clipUrlRef = useRef<string | null>(null);
  // 준비가 비동기라, 닫았다 다른 구간으로 다시 연 경우 늦게 끝난 요청이 덮어쓰는 걸 막는다
  const prepareSeqRef = useRef(0);

  useEffect(() => {
    setSttModelState(getSttModel());
  }, []);

  const revokeClip = useCallback(() => {
    if (clipUrlRef.current) {
      URL.revokeObjectURL(clipUrlRef.current);
      clipUrlRef.current = null;
    }
  }, []);

  const a = loopA != null && loopB != null ? Math.min(loopA, loopB) : null;
  const b = loopA != null && loopB != null ? Math.max(loopA, loopB) : null;

  // 열릴 때 한 번: 자막 프리필 + 구간 추출 + base64/라우드니스 준비
  useEffect(() => {
    if (!open) return;
    if (!mediaUrl || a == null || b == null) return;

    const seq = ++prepareSeqRef.current;
    const mid = (a + b) / 2;
    const filled = prefillFromSubs(subs, mid);

    setEnglish(filled.english);
    setKorean(filled.korean);
    setNote("");
    setTags([]);
    setClipError(null);
    setPreparing(true);
    revokeClip();
    setClip(null);

    (async () => {
      try {
        const blob = await extractRegionToMp3Blob(mediaUrl, a, b, kbps);
        const buffer = await blob.arrayBuffer();
        const { base64, stats } = await prepareAudioBuffer(buffer);
        if (seq !== prepareSeqRef.current) return; // 그새 다시 열렸다 — 결과 폐기

        const url = URL.createObjectURL(blob);
        clipUrlRef.current = url;
        setClip({ blob, base64, stats, bytes: blob.size, url });
      } catch (e) {
        if (seq !== prepareSeqRef.current) return;
        console.error(e);
        setClipError("구간을 오디오로 변환하지 못했습니다. 구간을 다시 지정해 주세요.");
      } finally {
        if (seq === prepareSeqRef.current) setPreparing(false);
      }
    })();
    // subs는 열린 뒤 바뀌어도 프리필을 다시 하지 않는다(사용자가 고친 내용을 덮어쓰지 않기 위해)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mediaUrl, a, b, kbps]);

  // 닫힐 때 / 언마운트 시 blob URL 정리
  useEffect(() => {
    if (!open) revokeClip();
  }, [open, revokeClip]);
  useEffect(() => revokeClip, [revokeClip]);

  async function handleTranscribe() {
    if (!clip) return;
    setSttPending(true);
    try {
      const form = new FormData();
      form.append("file", new File([clip.blob], "clip.mp3", { type: "audio/mpeg" }));
      form.append("model", sttModel);
      form.append("format", "text");

      const res = await fetch("/api/stt", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "텍스트 추출에 실패했습니다.");
        return;
      }
      const text = flatten(String(data.text ?? ""));
      if (!text) {
        toast.warning("인식된 텍스트가 없습니다.");
        return;
      }
      setEnglish(text);
      toast.success("영어 문장을 채웠습니다. 내용을 확인해 주세요.");
    } catch {
      toast.error("텍스트 추출 중 오류가 발생했습니다.");
    } finally {
      setSttPending(false);
    }
  }

  function handleSave() {
    if (!clip || !english.trim() || !korean.trim()) return;
    startSaving(async () => {
      const result = await saveSentence(english, korean, clip.base64, tags, "audio/mpeg", "mp3", note, clip.stats);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(result.success);
      // A–B 구간은 그대로 둔다 — 같은 자리에서 이어서 다듬거나 다음 구간으로 넘어가기 쉽게.
      onOpenChange(false);
    });
  }

  const oversize = clip != null && clip.bytes > MAX_AUDIO_BYTES;
  const risky = clip != null && !oversize && clip.base64.length > SAFE_PAYLOAD_BYTES;
  const canSave = !!clip && !oversize && !preparing && !saving && english.trim().length > 0 && korean.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-3 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>문장으로 저장</DialogTitle>
          <DialogDescription>
            {a != null && b != null ? `${fmtTime(a)} – ${fmtTime(b)} 구간` : "구간이 지정되지 않았습니다"}
            {fileName ? ` · ${fileName}` : ""}
          </DialogDescription>
        </DialogHeader>

        {/* 추출된 클립 미리듣기 — 폼 로컬 <audio>다. 플레이어의 WaveSurfer와 섞지 말 것. */}
        <div className="border-border bg-muted/40 rounded-lg border p-3">
          {clipError ? (
            <p className="text-destructive text-sm">{clipError}</p>
          ) : preparing || clip ? (
            <>
              {/* 변환 중에도 <audio>를 src 없이 마운트해 둔다 — 컨트롤 바 높이가 그대로라 변환 전후 섹션 높이가 구조적으로 같아진다.
                  min-h-[54px] 같은 매직 넘버로 되돌리지 말 것(네이티브 audio 높이는 브라우저·OS마다 다르다). */}
              <div className="relative">
                <audio controls src={clip?.url} className={cn("w-full", !clip && "invisible")} />
                {!clip && (
                  <div className="text-muted-foreground absolute inset-0 flex items-center gap-2 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    구간을 오디오로 변환하는 중…
                  </div>
                )}
              </div>
              {/* 변환 중엔 &nbsp;로 같은 한 줄을 유지한다 */}
              <p className="text-muted-foreground mt-2 text-xs">{clip ? `MP3 ${kbps}k · ${(clip.bytes / 1024).toFixed(0)}KB` : " "}</p>
              {oversize && <p className="text-destructive mt-1 text-xs">클립이 10MB를 넘습니다. 구간을 줄이거나 비트레이트를 낮춰 주세요.</p>}
              {risky && (
                <p className="text-accent-orange mt-1 text-xs">
                  클립이 큽니다. 배포 환경(요청 본문 4.5MB 제한)에서는 저장이 실패할 수 있어요 — 비트레이트를 낮추거나 구간을 줄이는 걸 권합니다.
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground text-sm">구간을 먼저 지정해 주세요.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="save-english">영어 문장</Label>
            <div className="flex items-center gap-1.5">
              {/* 인식 모델 — 선택 즉시 localStorage에 기억(기기별) */}
              <select
                value={sttModel}
                onChange={(e) => {
                  const id = e.target.value as SttModelId;
                  setSttModelState(id);
                  setSttModel(id);
                }}
                disabled={sttPending}
                aria-label="인식 모델"
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/20 h-7 rounded-md border px-1.5 text-xs outline-none focus-visible:ring-[3px]"
              >
                {STT_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" disabled={!clip || sttPending} onClick={handleTranscribe}>
                {sttPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                영어 자동 채우기
              </Button>
            </div>
          </div>
          <Input id="save-english" value={english} onChange={(e) => setEnglish(e.target.value)} placeholder="영어 문장" maxLength={500} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="save-korean">한국어 뜻</Label>
          <Input id="save-korean" value={korean} onChange={(e) => setKorean(e.target.value)} placeholder="한국어 뜻" maxLength={500} />
        </div>

        <div className="space-y-1.5">
          <Label>태그</Label>
          <TagPicker value={tags} onChange={setTags} presets={presets} onPresetsChange={setPresets} disabled={saving} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="save-note">메모 (선택)</Label>
          <textarea
            id="save-note"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
            rows={2}
            placeholder="기억할 표현, 문법 포인트 등"
            className="border-input focus-visible:ring-ring/50 w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            취소
          </Button>
          <Button type="button" variant="brand" onClick={handleSave} disabled={!canSave}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            저장
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
