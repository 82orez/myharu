"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { setDday } from "@/app/(learn)/settings/actions";
import {
  DDAY_PERIOD_PRESETS,
  MAX_DDAY_LABEL,
  MAX_DDAY_PERIOD,
  MIN_DDAY_PERIOD,
  dateAfterDays,
  ddayDiff,
  formatDday,
  isValidDdayDate,
} from "@/lib/dday";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// D-day 목표 — 이름 + (날짜 | 기간) 입력 후 "저장"으로 반영(값이 바뀌고 유효할 때만 활성).
// ⚠️ 저장되는 값은 목표일 하나뿐이다. "기간"은 목표일을 계산하는 입력 방법일 뿐이라 mode는
// 컴포넌트 로컬 state이고 서버·localStorage 어디에도 남기지 않는다.
export default function DdayField({ initialLabel, initialDate }: { initialLabel: string; initialDate: string | null }) {
  const [saved, setSaved] = useState({ label: initialLabel, date: initialDate ?? "" }); // 저장된 값
  const [label, setLabel] = useState(initialLabel);
  const [date, setDate] = useState(initialDate ?? "");
  const [mode, setMode] = useState<"date" | "period">("date");
  const [days, setDays] = useState("");
  const [saving, startSaving] = useTransition();

  const trimmed = label.trim();
  const period = Number(days.trim());
  const periodValid = days.trim() !== "" && Number.isInteger(period) && period >= MIN_DDAY_PERIOD && period <= MAX_DDAY_PERIOD;

  // 저장될 목표일. 기간 모드에서는 오늘+N일로 파생한다(저장 경로는 날짜 모드와 하나로 유지).
  const effectiveDate = mode === "period" ? (periodValid ? dateAfterDays(period) : "") : date;
  const valid = trimmed.length <= MAX_DDAY_LABEL && (mode === "period" ? periodValid : date === "" || isValidDdayDate(date));
  const changed = trimmed !== saved.label || effectiveDate !== saved.date;
  const canSave = valid && changed && !saving;

  // ⚠️ 이 프리필을 useState 초기값으로 올리지 말 것 — ddayDiff가 todayKST()를 읽어 SSR/하이드레이션
  // 불일치가 생긴다. 사용자가 "기간"을 누른 시점(클라이언트)에만 계산한다.
  function switchToPeriod() {
    setMode("period");
    if (days === "" && date && isValidDdayDate(date)) {
      const diff = ddayDiff(date);
      if (diff > 0) setDays(String(diff));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    startSaving(async () => {
      const result = await setDday(trimmed, effectiveDate || null);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setSaved({ label: trimmed, date: effectiveDate });
      setLabel(trimmed);
      setDate(effectiveDate); // 날짜 모드로 되돌아갔을 때 계산된 목표일이 보이도록
      toast.success(effectiveDate ? "저장되었습니다." : "D-day를 해제했습니다.");
    });
  }

  // ⚠️ form의 noValidate를 빼지 말 것 — 날짜를 일부만 지우면(예: 연도 segment만 삭제) input이
  // validity.badInput 상태가 되어 네이티브 검증이 submit을 통째로 막는다. 그러면 "저장" 버튼이
  // 활성인데 눌러도 아무 일이 없다(실제로 겪음). 이 상태의 value는 ""라 해제로 처리하면 된다.
  return (
    <form noValidate onSubmit={handleSubmit} className="flex shrink-0 flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
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
        <div className="flex gap-1">
          <Button type="button" variant={mode === "date" ? "brand" : "outline"} size="sm" disabled={saving} onClick={() => setMode("date")}>
            날짜
          </Button>
          <Button type="button" variant={mode === "period" ? "brand" : "outline"} size="sm" disabled={saving} onClick={switchToPeriod}>
            기간
          </Button>
        </div>
        {mode === "date" ? (
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={saving}
            aria-label="D-day 목표일"
            aria-invalid={date !== "" && !isValidDdayDate(date)}
            className="w-40"
          />
        ) : (
          <>
            <Input
              type="number"
              inputMode="numeric"
              min={MIN_DDAY_PERIOD}
              max={MAX_DDAY_PERIOD}
              step={1}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              disabled={saving}
              aria-label="D-day 기간(일)"
              aria-invalid={days.trim() !== "" && !periodValid}
              className="w-20 text-right tabular-nums"
            />
            <span className="text-muted-foreground text-sm">일</span>
          </>
        )}
        <Button type="submit" variant="brand" size="sm" disabled={!canSave}>
          {saving ? <Loader2 className="animate-spin" size={16} /> : "저장"}
        </Button>
      </div>

      {mode === "period" && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {DDAY_PERIOD_PRESETS.map((preset) => (
            <Button
              key={preset}
              type="button"
              variant={days.trim() === String(preset) ? "brand" : "outline"}
              size="sm"
              disabled={saving}
              onClick={() => setDays(String(preset))}>
              {preset}일
            </Button>
          ))}
        </div>
      )}

      {mode === "period" && periodValid && (
        <p className="text-muted-foreground text-xs tabular-nums">
          → {effectiveDate} · {formatDday(period)}
        </p>
      )}
    </form>
  );
}
