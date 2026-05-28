"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Target, RotateCcw, Flame } from "lucide-react";
import { resetLearningGoal, setLearningGoal } from "@/app/(learn)/learn/goal/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import type { GoalProgress } from "@/types/gamification";

const PRESETS: { label: string; total: number; days: number }[] = [
  { label: "100일 1000문장", total: 1000, days: 100 },
  { label: "30일 300문장", total: 300, days: 30 },
  { label: "60일 500문장", total: 500, days: 60 },
];

export default function GoalForm({ initialGoal }: { initialGoal: GoalProgress | null }) {
  const router = useRouter();
  const [total, setTotal] = useState<string>(initialGoal?.totalGoal?.toString() ?? "1000");
  const [days, setDays] = useState<string>(initialGoal?.periodDays?.toString() ?? "100");
  const [saving, startSaving] = useTransition();
  const [resetting, startResetting] = useTransition();

  const totalNum = Number(total);
  const daysNum = Number(days);
  const validInputs = Number.isInteger(totalNum) && totalNum >= 1 && totalNum <= 10000 && Number.isInteger(daysNum) && daysNum >= 1 && daysNum <= 365;
  const dailyPreview = validInputs ? Math.ceil(totalNum / daysNum) : null;

  function applyPreset(p: (typeof PRESETS)[number]) {
    setTotal(p.total.toString());
    setDays(p.days.toString());
  }

  function handleSave() {
    if (!validInputs) {
      toast.error("입력 값을 다시 확인해 주세요.");
      return;
    }
    startSaving(async () => {
      const result = await setLearningGoal(totalNum, daysNum);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("학습 목표가 저장되었습니다.");
      router.push("/");
      router.refresh();
    });
  }

  function handleReset() {
    startResetting(async () => {
      const result = await resetLearningGoal();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("목표가 초기화되었습니다.");
      router.push("/");
      router.refresh();
    });
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target size={20} className="text-brand" />
          학습 목표 설정
        </CardTitle>
        <CardDescription>
          총 암기할 문장 수와 기간을 설정해 보세요. 매일 채워야 할 최소 문장 수는 진도에 따라 자동으로 조절됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {initialGoal && (
          <div className="border-brand/20 bg-brand/5 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <Flame size={16} className="text-brand" />
            <span>
              현재 진도: <strong>{initialGoal.memorized}</strong> / {initialGoal.totalGoal}문장 · 남은 {initialGoal.daysRemaining}일
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p.label} variant="outline" size="sm" onClick={() => applyPreset(p)} disabled={saving || resetting}>
              {p.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="total">총 암기 목표 문장 수</Label>
          <Input
            id="total"
            type="number"
            inputMode="numeric"
            min={1}
            max={10000}
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            disabled={saving || resetting}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="days">기간 (일)</Label>
          <Input
            id="days"
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            disabled={saving || resetting}
          />
        </div>

        {dailyPreview !== null && (
          <div className="bg-muted/50 text-muted-foreground rounded-lg px-3 py-2 text-sm">
            예상 일일 최소치 — 하루 약 <strong className="text-foreground">{dailyPreview}문장</strong>
          </div>
        )}

        <Button variant="brand" onClick={handleSave} disabled={!validInputs || saving || resetting}>
          {saving ? (
            <>
              <Loader2 className="animate-spin" size={16} />
              저장 중...
            </>
          ) : (
            "목표 저장"
          )}
        </Button>

        {initialGoal && (
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="ghost" size="sm" disabled={saving || resetting} />}>
              <RotateCcw size={14} />
              목표 초기화
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>목표를 초기화할까요?</AlertDialogTitle>
                <AlertDialogDescription>
                  설정한 목표 정보가 삭제됩니다. 이미 학습한 문장 기록은 그대로 유지됩니다.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={handleReset} disabled={resetting}>
                  {resetting ? <Loader2 className="animate-spin" size={16} /> : "초기화"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardContent>
    </Card>
  );
}
