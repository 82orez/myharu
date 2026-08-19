"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { setDday } from "@/app/(learn)/settings/actions";
import { MAX_DDAY_LABEL, isValidDdayDate } from "@/lib/dday";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// D-day 목표 — 이름 + 날짜 입력 후 "저장"으로 반영(값이 바뀌고 유효할 때만 활성).
// 날짜를 비우고 저장하면 해제되어 Navbar 배지가 사라진다.
export default function DdayField({ initialLabel, initialDate }: { initialLabel: string; initialDate: string | null }) {
  const [saved, setSaved] = useState({ label: initialLabel, date: initialDate ?? "" }); // 저장된 값
  const [label, setLabel] = useState(initialLabel);
  const [date, setDate] = useState(initialDate ?? "");
  const [saving, startSaving] = useTransition();

  const trimmed = label.trim();
  const valid = trimmed.length <= MAX_DDAY_LABEL && (date === "" || isValidDdayDate(date));
  const changed = trimmed !== saved.label || date !== saved.date;
  const canSave = valid && changed && !saving;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    startSaving(async () => {
      const result = await setDday(trimmed, date || null);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setSaved({ label: trimmed, date });
      setLabel(trimmed);
      toast.success(date ? "저장되었습니다." : "D-day를 해제했습니다.");
    });
  }

  // ⚠️ form의 noValidate를 빼지 말 것 — 날짜를 일부만 지우면(예: 연도 segment만 삭제) input이
  // validity.badInput 상태가 되어 네이티브 검증이 submit을 통째로 막는다. 그러면 "저장" 버튼이
  // 활성인데 눌러도 아무 일이 없다(실제로 겪음). 이 상태의 value는 ""라 해제로 처리하면 된다.
  return (
    <form noValidate onSubmit={handleSubmit} className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      <Input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        disabled={saving}
        maxLength={MAX_DDAY_LABEL}
        placeholder="수능"
        aria-label="D-day 이름"
        className="w-24"
      />
      <Input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        disabled={saving}
        aria-label="D-day 목표일"
        aria-invalid={date !== "" && !isValidDdayDate(date)}
        className="w-40"
      />
      <Button type="submit" variant="brand" size="sm" disabled={!canSave}>
        {saving ? <Loader2 className="animate-spin" size={16} /> : "저장"}
      </Button>
    </form>
  );
}
