"use client";

import { useState } from "react";
import { Check, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SPEED_OPTIONS, speedLabel } from "@/lib/tts-voices";
import { cn } from "@/lib/utils";

export default function SpeedPicker({
  value,
  onChange,
  disabled,
  className = "h-12 rounded-xl font-bold",
}: {
  value: number;
  onChange: (speed: number) => void;
  disabled?: boolean;
  // 트리거 버튼 크기 — 편집 폼처럼 작은 버튼 줄에 놓을 때 덮어쓴다
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  function handleSelect(speed: number) {
    onChange(speed);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" disabled={disabled} className={className} />}>
        <Gauge size={16} />
        {speedLabel(value)}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>말하기 속도</DialogTitle>
          <DialogDescription>AI 음성의 빠르기를 선택하세요. 음색마다 기본 발화 속도가 달라 실제 속도는 자동으로 보정됩니다.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SPEED_OPTIONS.map((s) => {
            const selected = s.value === value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => handleSelect(s.value)}
                className={cn(
                  "relative flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors",
                  selected ? "border-brand bg-brand/5" : "border-border hover:border-brand/40 hover:bg-muted/40",
                )}
              >
                {selected && <Check size={16} className="text-brand absolute top-3 right-3" />}
                <span className={cn("text-base font-bold tabular-nums", selected ? "text-brand" : "text-foreground")}>{s.label}</span>
                <span className={cn("text-sm", selected ? "text-brand/80" : "text-muted-foreground")}>{s.desc}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
