"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { deleteAllSentences } from "@/app/(learn)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const CONFIRM_WORD = "삭제";

export default function DeleteAllSentences({ sentenceCount }: { sentenceCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, startDeleting] = useTransition();

  const empty = sentenceCount === 0;
  const canDelete = confirmText.trim() === CONFIRM_WORD && !deleting;

  function handleDelete() {
    startDeleting(async () => {
      const result = await deleteAllSentences();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      setConfirmText("");
      toast.success(`문장 ${(result.deleted ?? 0).toLocaleString()}개를 삭제했습니다.`);
      router.refresh();
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmText("");
      }}>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" disabled={empty || deleting} className="shrink-0" />}>
        {deleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
        {empty ? "삭제할 문장 없음" : "전체 삭제"}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>등록된 문장 전체 삭제</AlertDialogTitle>
          <AlertDialogDescription>
            문장 {sentenceCount.toLocaleString()}개와 음성 파일이 모두 삭제됩니다. <strong>연습 기록도 함께 삭제</strong>되어 오늘의 목표·학습
            달력·연습횟수 합계가 초기화됩니다. 되돌릴 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="deleteConfirm">
            계속하려면 <span className="text-destructive font-semibold">{CONFIRM_WORD}</span> 를 입력하세요.
          </Label>
          <Input
            id="deleteConfirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={CONFIRM_WORD}
            autoComplete="off"
            disabled={deleting}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
          {/* AlertDialogAction이 아니라 일반 Button — 삭제 중 스피너를 다이얼로그 안에서 보여주고,
              실패 시 다시 시도할 수 있게 열린 상태를 유지해야 한다(닫기는 handleDelete가 성공 시에만). */}
          <Button disabled={!canDelete} onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-white">
            {deleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            영구 삭제
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
