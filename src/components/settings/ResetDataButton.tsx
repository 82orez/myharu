"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { resetPracticeCounts, resetPracticeHistory } from "@/app/(learn)/settings/actions";
import { Button } from "@/components/ui/button";
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

const CONFIRM_WORD = "초기화";

// counts = 문장별 카운터(카드 표시), history = practice_results(달력·오늘 진도). 둘은 서로 독립이다.
export type ResetKind = "counts" | "history";

export default function ResetDataButton({ kind, count }: { kind: ResetKind; count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [resetting, startResetting] = useTransition();

  const empty = count === 0;
  const canReset = confirmText.trim() === CONFIRM_WORD && !resetting;
  const isCounts = kind === "counts";
  const title = isCounts ? "연습 횟수 초기화" : "학습 기록 초기화";

  function handleReset() {
    startResetting(async () => {
      const result = isCounts ? await resetPracticeCounts() : await resetPracticeHistory();
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      setConfirmText("");
      toast.success(
        isCounts
          ? "연습 횟수를 초기화했습니다."
          : `학습 기록 ${("deleted" in result ? (result.deleted ?? 0) : 0).toLocaleString()}건을 삭제했습니다.`,
      );
      router.refresh();
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmText("");
      }}
    >
      <AlertDialogTrigger render={<Button variant="outline" size="sm" disabled={empty || resetting} className="shrink-0" />}>
        {resetting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1 h-4 w-4" />}
        {empty ? "초기화할 기록 없음" : "초기화"}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {isCounts ? (
              <>
                문장 카드의 연습 횟수(스피킹·쓰기·듣기 합계 {count.toLocaleString()}회)가 모두 0이 됩니다. 문장과 음성 파일은 삭제되지 않고,{" "}
                <strong>학습 달력과 오늘의 목표 진도는 그대로 유지</strong>됩니다. 되돌릴 수 없습니다.
              </>
            ) : (
              <>
                연습 기록 {count.toLocaleString()}건이 삭제되어 <strong>오늘의 목표 진도와 학습 달력이 초기화</strong>됩니다. 문장 카드의 연습 횟수는
                그대로 남습니다. 되돌릴 수 없습니다.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`resetConfirm-${kind}`}>
            계속하려면 <span className="text-destructive font-semibold">{CONFIRM_WORD}</span> 를 입력하세요.
          </Label>
          <Input
            id={`resetConfirm-${kind}`}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={CONFIRM_WORD}
            autoComplete="off"
            disabled={resetting}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={resetting}>취소</AlertDialogCancel>
          <AlertDialogAction disabled={!canReset} onClick={handleReset} className="bg-destructive hover:bg-destructive/90 text-white">
            {resetting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            초기화
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
