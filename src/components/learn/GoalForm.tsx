"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Mic, Target } from "lucide-react";
import { setSpeechStrict } from "@/app/(learn)/learn/goal/actions";
import { DAILY_PRACTICE_GOAL } from "@/lib/goal-config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default function GoalForm({ initialSpeechStrict }: { initialSpeechStrict: boolean }) {
  const router = useRouter();
  const [speechStrict, setSpeechStrictState] = useState<boolean>(initialSpeechStrict);
  const [saving, startSaving] = useTransition();

  function handleSave() {
    startSaving(async () => {
      const result = await setSpeechStrict(speechStrict);
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
          학습 설정
        </CardTitle>
        <CardDescription>
          하루 목표는 연습 {DAILY_PRACTICE_GOAL.toLocaleString()}회로 고정되어 있습니다. 홈의 오늘 진행률과 학습 달력 달성 기준이 됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label className="flex items-center gap-2">
            <Mic size={16} className="text-brand" />
            스피킹 채점 난이도
          </Label>
          <p className="text-muted-foreground text-sm">말하기 정답 인정 기준입니다. (쓰기는 항상 보통 기준)</p>
          <div className="flex gap-2">
            <Button variant={speechStrict ? "outline" : "brand"} size="sm" onClick={() => setSpeechStrictState(false)} disabled={saving}>
              보통 (80% 이상)
            </Button>
            <Button variant={speechStrict ? "brand" : "outline"} size="sm" onClick={() => setSpeechStrictState(true)} disabled={saving}>
              엄격 (90% 이상)
            </Button>
          </div>
        </div>

        <Button variant="brand" onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="animate-spin" size={16} />
              저장 중...
            </>
          ) : (
            "설정 저장"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
