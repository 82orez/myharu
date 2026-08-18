"use client";

import { useEffect, useState } from "react";
import { Pin, PinOff, Archive, ArchiveRestore, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MAX_MEMO_CONTENT, MAX_MEMO_TITLE, MEMO_COLORS, isEmptyMemo, type MemoColor } from "@/lib/memo";
import type { Memo } from "@/app/(learn)/memo/actions";

/**
 * 메모 편집 모달. Keep처럼 **닫을 때 변경분을 저장**한다(별도 저장 버튼 없음).
 * 제목·본문이 모두 비면 저장하지 않고 원본을 유지한다.
 */
export default function MemoEditorDialog({
  memo,
  onClose,
  onSave,
  onPin,
  onArchive,
  onDelete,
}: {
  memo: Memo | null;
  onClose: () => void;
  onSave: (id: string, patch: { title: string; content: string; color: MemoColor }) => void;
  onPin: (memo: Memo) => void;
  onArchive: (memo: Memo) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [color, setColor] = useState<MemoColor>("default");

  useEffect(() => {
    if (!memo) return;
    setTitle(memo.title);
    setContent(memo.content);
    setColor(memo.color);
  }, [memo]);

  function close() {
    if (memo) {
      const changed = title !== memo.title || content !== memo.content || color !== memo.color;
      // 변경이 없으면 서버를 부르지 않는다. 빈 메모가 되면 저장하지 않고 원본 유지.
      if (changed && !isEmptyMemo(title, content)) {
        onSave(memo.id, { title, content, color });
      }
    }
    onClose();
  }

  return (
    <Dialog open={memo !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90vh] gap-3 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="sr-only">메모 편집</DialogTitle>
        </DialogHeader>

        <Input
          value={title}
          maxLength={MAX_MEMO_TITLE}
          placeholder="제목"
          onChange={(e) => setTitle(e.target.value)}
          className="h-10 border-none px-0 text-base font-semibold shadow-none focus-visible:ring-0"
        />
        <textarea
          value={content}
          rows={10}
          maxLength={MAX_MEMO_CONTENT}
          placeholder="메모 작성..."
          onChange={(e) => setContent(e.target.value)}
          className="w-full resize-y bg-transparent text-sm leading-relaxed outline-none"
        />

        <div className="flex flex-wrap items-center gap-1.5">
          {MEMO_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-label={c.label}
              onClick={() => setColor(c.value)}
              className={`h-6 w-6 rounded-full border ${c.swatch} ${color === c.value ? "ring-brand ring-2 ring-offset-1" : ""}`}>
              {color === c.value && <Check className="text-foreground/70 mx-auto h-3.5 w-3.5" />}
            </button>
          ))}
        </div>

        {memo && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex gap-1">
              <Button variant="ghost" size="icon-sm" aria-label={memo.is_pinned ? "고정 해제" : "고정"} onClick={() => onPin(memo)}>
                {memo.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={memo.is_archived ? "보관 해제" : "보관"} onClick={() => onArchive(memo)}>
                {memo.is_archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="삭제"
                className="text-destructive"
                onClick={() => {
                  onDelete(memo.id);
                  onClose();
                }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" onClick={close}>
              닫기
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
