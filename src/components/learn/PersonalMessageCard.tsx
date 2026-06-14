"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Quote } from "lucide-react";
import { setPersonalMessage } from "@/app/(learn)/learn/goal/actions";
import { DEFAULT_PERSONAL_MESSAGE, MAX_PERSONAL_MESSAGE } from "@/lib/goal-config";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function PersonalMessageCard({ initialMessage }: { initialMessage: string }) {
  const router = useRouter();
  const [message, setMessage] = useState(initialMessage);
  const [draft, setDraft] = useState(initialMessage);
  const [open, setOpen] = useState(false);
  const [saving, startSaving] = useTransition();

  const display = message.trim() || DEFAULT_PERSONAL_MESSAGE;

  function openDialog() {
    setDraft(message);
    setOpen(true);
  }

  function handleSave() {
    startSaving(async () => {
      const result = await setPersonalMessage(draft);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setMessage(draft.trim());
      setOpen(false);
      toast.success("저장되었습니다.");
      router.refresh();
    });
  }

  return (
    <>
      <Card className="border-brand/20 bg-brand/5 relative">
        <CardContent className="flex items-center justify-center gap-3 py-5 text-center">
          <Quote size={24} className="text-brand shrink-0" />
          <p className="text-foreground text-xl font-bold italic sm:text-2xl">{display}</p>
        </CardContent>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={openDialog}
          aria-label="한 마디 수정"
          className="text-muted-foreground hover:text-brand absolute top-2 right-2">
          <Pencil size={16} />
        </Button>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>자신에게 한 마디</DialogTitle>
            <DialogDescription>매일 학습할 때 떠올릴 다짐을 적어 보세요. 홈 화면에 표시됩니다.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <textarea
              autoFocus
              placeholder={DEFAULT_PERSONAL_MESSAGE}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={saving}
              className="border-input bg-background ring-ring/10 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/20 flex min-h-[80px] w-full rounded-md border px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
              maxLength={MAX_PERSONAL_MESSAGE}
            />
            <div className="flex justify-end">
              <span className="text-muted-foreground text-xs">
                {draft.length}/{MAX_PERSONAL_MESSAGE}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              취소
            </Button>
            <Button type="button" variant="brand" onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  저장 중...
                </>
              ) : (
                "저장"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
