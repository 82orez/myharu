"use client";

import { useState } from "react";
import { Check, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TTS_VOICES, type TtsVoiceId } from "@/lib/tts-voices";
import { cn } from "@/lib/utils";

const GENDER_BADGE: Record<string, string> = {
  남성: "bg-blue-100 text-blue-700",
  여성: "bg-pink-100 text-pink-700",
  중성: "bg-gray-100 text-gray-700",
};

const ACCENT_BADGE: Record<string, string> = {
  미국식: "bg-purple-100 text-purple-700",
  영국식: "bg-green-100 text-green-700",
};

export default function VoicePicker({
  value,
  onChange,
  disabled,
}: {
  value: TtsVoiceId;
  onChange: (voice: TtsVoiceId) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = TTS_VOICES.find((v) => v.id === value) ?? TTS_VOICES[0];

  function handleSelect(id: TtsVoiceId) {
    onChange(id);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" disabled={disabled} className="h-12 rounded-xl font-bold" />
        }>
        <SlidersHorizontal size={16} />
        음성: {current.label}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>음성 선택</DialogTitle>
          <DialogDescription>AI 음성 생성에 사용할 음색을 선택하세요.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TTS_VOICES.map((v) => {
            const selected = v.id === value;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => handleSelect(v.id)}
                className={cn(
                  "relative flex flex-col gap-2 rounded-xl border p-3 text-left transition-colors",
                  selected ? "border-brand bg-brand/5" : "border-border hover:border-brand/40 hover:bg-muted/40",
                )}>
                {selected && <Check size={16} className="text-brand absolute top-3 right-3" />}
                <span className={cn("text-base font-bold", selected ? "text-brand" : "text-foreground")}>{v.label}</span>
                <div className="flex gap-1.5">
                  <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", GENDER_BADGE[v.gender])}>{v.gender}</span>
                  <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", ACCENT_BADGE[v.accent])}>{v.accent}</span>
                </div>
                <span className={cn("text-sm", selected ? "text-brand/80" : "text-muted-foreground")}>{v.desc}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
