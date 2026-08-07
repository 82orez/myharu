"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { setDailyGoal } from "@/app/(learn)/settings/actions";
import { MAX_DAILY_GOAL, MIN_DAILY_GOAL } from "@/lib/settings-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// 하루 목표 연습 횟수 — 숫자 입력 후 "저장"으로 반영(값이 바뀌고 유효할 때만 활성)
export default function DailyGoalField({ initialGoal }: { initialGoal: number }) {
  const [goal, setGoal] = useState(initialGoal); // 저장된 값
  const [draft, setDraft] = useState(String(initialGoal)); // 입력 중 문자열(지우고 다시 칠 수 있게 빈 값 허용)
  const [saving, startSaving] = useTransition();

  const parsed = Number(draft.trim());
  const valid = draft.trim() !== "" && Number.isInteger(parsed) && parsed >= MIN_DAILY_GOAL && parsed <= MAX_DAILY_GOAL;
  const canSave = valid && parsed !== goal && !saving;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    startSaving(async () => {
      const result = await setDailyGoal(parsed);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setGoal(parsed);
      toast.success("저장되었습니다.");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex shrink-0 items-center gap-2">
      <Input
        type="number"
        inputMode="numeric"
        min={MIN_DAILY_GOAL}
        max={MAX_DAILY_GOAL}
        step={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={saving}
        aria-label="하루 목표 연습 횟수"
        aria-invalid={draft.trim() !== "" && !valid}
        className="w-24 text-right tabular-nums"
      />
      <span className="text-muted-foreground text-sm">회</span>
      <Button type="submit" variant="brand" size="sm" disabled={!canSave}>
        {saving ? <Loader2 className="animate-spin" size={16} /> : "저장"}
      </Button>
    </form>
  );
}
