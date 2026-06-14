"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Target } from "lucide-react";
import { setDailyGoal } from "@/app/(learn)/learn/goal/actions";
import { MAX_DAILY_GOAL } from "@/lib/goal-config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRESETS = [3, 5, 10, 20];

export default function GoalForm({ initialDailyGoal }: { initialDailyGoal: number }) {
  const router = useRouter();
  const [goal, setGoal] = useState<string>(initialDailyGoal.toString());
  const [saving, startSaving] = useTransition();

  const goalNum = Number(goal);
  const validInput = Number.isInteger(goalNum) && goalNum >= 1 && goalNum <= MAX_DAILY_GOAL;

  function handleSave() {
    if (!validInput) {
      toast.error(`하루 목표는 1~${MAX_DAILY_GOAL}문장 사이여야 합니다.`);
      return;
    }
    startSaving(async () => {
      const result = await setDailyGoal(goalNum);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("설정이 저장되었습니다.");
      router.push("/");
      router.refresh();
    });
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target size={20} className="text-brand" />
          하루 목표 설정
        </CardTitle>
        <CardDescription>하루에 새로 암기할 문장 수를 정해 보세요. 홈의 오늘 진행률과 학습 달력 달성 기준이 됩니다.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((n) => (
            <Button key={n} variant={goalNum === n ? "brand" : "outline"} size="sm" onClick={() => setGoal(n.toString())} disabled={saving}>
              하루 {n}문장
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="dailyGoal">하루 목표 문장 수</Label>
          <Input
            id="dailyGoal"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_DAILY_GOAL}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            disabled={saving}
          />
        </div>

        <Button variant="brand" onClick={handleSave} disabled={!validInput || saving}>
          {saving ? (
            <>
              <Loader2 className="animate-spin" size={16} />
              저장 중...
            </>
          ) : (
            "목표 저장"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
