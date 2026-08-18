"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { Pin, PinOff, Archive, ArchiveRestore, Trash2, Search, Palette, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import MemoEditorDialog from "@/components/memo/MemoEditorDialog";
import {
  MAX_MEMO_CONTENT,
  MAX_MEMO_TITLE,
  MEMO_COLORS,
  filterMemos,
  isEmptyMemo,
  memoColor,
  sortMemos,
  type MemoColor,
  type MemoView,
} from "@/lib/memo";
import { addMemo, deleteMemo, setMemoArchived, setMemoPinned, updateMemo, type Memo } from "@/app/(learn)/memo/actions";

// 아이콘 버튼 설명. base-ui Tooltip 트리거는 단일 엘리먼트여야 해서 span으로 감싼다
// (버튼 자체는 Dialog/AlertDialog 트리거로 이미 쓰이는 경우가 있다).
function IconTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export default function MemoClient({ initialMemos, initialError }: { initialMemos: Memo[]; initialError?: string }) {
  const [memos, setMemos] = useState<Memo[]>(initialMemos);
  const [view, setView] = useState<MemoView>("active");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Memo | null>(null);

  // 빠른 작성 바
  const [composing, setComposing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftColor, setDraftColor] = useState<MemoColor>("default");
  const [saving, startSaving] = useTransition();

  const patchLocal = useCallback((id: string, patch: Partial<Memo>) => {
    setMemos((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  // 정렬·필터는 순수 로직(lib/memo.ts) 공용 — 여기서 다시 구현하지 말 것
  const visible = useMemo(() => sortMemos(filterMemos(memos, view, query)), [memos, view, query]);
  const pinned = visible.filter((m) => m.is_pinned);
  const others = visible.filter((m) => !m.is_pinned);
  const archivedCount = memos.filter((m) => m.is_archived).length;

  function resetDraft() {
    setComposing(false);
    setDraftTitle("");
    setDraftContent("");
    setDraftColor("default");
  }

  function handleCreate() {
    if (isEmptyMemo(draftTitle, draftContent)) {
      resetDraft();
      return;
    }
    startSaving(async () => {
      const result = await addMemo({ title: draftTitle, content: draftContent, color: draftColor });
      if (result.error || !result.memo) {
        toast.error(result.error ?? "메모를 저장하지 못했습니다.");
        return;
      }
      setMemos((prev) => [result.memo!, ...prev]);
      resetDraft();
    });
  }

  function handleSave(id: string, patch: { title: string; content: string; color: MemoColor }) {
    const before = memos.find((m) => m.id === id);
    patchLocal(id, { ...patch, updated_at: new Date().toISOString() });
    void updateMemo(id, patch).then((result) => {
      if (result.error || !result.memo) {
        if (before) patchLocal(id, before);
        toast.error(result.error ?? "메모를 수정하지 못했습니다.");
        return;
      }
      patchLocal(id, result.memo);
    });
  }

  function handleColor(memo: Memo, color: MemoColor) {
    handleSave(memo.id, { title: memo.title, content: memo.content, color });
  }

  function handlePin(memo: Memo) {
    const next = !memo.is_pinned;
    patchLocal(memo.id, { is_pinned: next });
    void setMemoPinned(memo.id, next).then((result) => {
      if (result.error) {
        patchLocal(memo.id, { is_pinned: !next });
        toast.error(result.error);
      }
    });
  }

  function handleArchive(memo: Memo) {
    const next = !memo.is_archived;
    // 보관하면 서버가 고정도 해제한다 — 낙관적 갱신도 같이 맞춰 준다
    patchLocal(memo.id, { is_archived: next, is_pinned: next ? false : memo.is_pinned });
    void setMemoArchived(memo.id, next).then((result) => {
      if (result.error) {
        patchLocal(memo.id, { is_archived: memo.is_archived, is_pinned: memo.is_pinned });
        toast.error(result.error);
        return;
      }
      toast.success(next ? "보관함으로 옮겼습니다." : "보관을 해제했습니다.");
    });
  }

  function handleDelete(id: string) {
    const before = memos;
    setMemos((prev) => prev.filter((m) => m.id !== id));
    void deleteMemo(id).then((result) => {
      if (result.error) {
        setMemos(before);
        toast.error(result.error);
      }
    });
  }

  function renderCard(memo: Memo) {
    const palette = memoColor(memo.color);
    return (
      <div
        key={memo.id}
        role="button"
        tabIndex={0}
        onClick={() => setEditing(memo)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setEditing(memo);
        }}
        className={`relative mb-3 block break-inside-avoid overflow-hidden rounded-xl border p-3 pb-11 text-left transition-shadow hover:shadow-md ${palette.card}`}>
        {/* 기본 크기를 정사각형으로 잡아 주는 스페이서. 폭 0 + padding-top 100%라 자리는 차지하지 않고 높이만 확보하고,
            내용이 길면 카드가 그만큼 늘어난다(overflow-hidden이 float를 감싸야 높이에 반영된다).
            ⚠️ max-h로 상한을 두는 이유: 1열(모바일)처럼 카드가 넓을 때 정사각형이면 지나치게 높아진다. */}
        <div aria-hidden className="float-right max-h-56 w-0 pt-[100%]" />
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {memo.title && <p className="mb-1 truncate text-sm font-semibold">{memo.title}</p>}
            {memo.content && <p className="line-clamp-[12] text-sm whitespace-pre-wrap">{memo.content}</p>}
            {!memo.title && !memo.content && <p className="text-muted-foreground text-sm">(빈 메모)</p>}
          </div>
          {/* ⚠️ 카드 클릭(편집 모달)과 겹치므로 액션은 모두 stopPropagation 필수 */}
          <IconTip label={memo.is_pinned ? "고정 해제" : "고정"}>
            <button
              type="button"
              aria-label={memo.is_pinned ? "고정 해제" : "고정"}
              onClick={(e) => {
                e.stopPropagation();
                handlePin(memo);
              }}
              className={memo.is_pinned ? "text-brand shrink-0" : "text-muted-foreground/60 hover:text-foreground shrink-0"}>
              {memo.is_pinned ? <Pin className="h-4 w-4 fill-current" /> : <Pin className="h-4 w-4" />}
            </button>
          </IconTip>
        </div>

        {/* 액션 줄은 카드 하단 중앙 고정 — 카드에 pb를 줘 본문이 아이콘 아래로 흘러들지 않게 한다 */}
        <div
          className="text-muted-foreground absolute inset-x-0 bottom-2 flex items-center justify-center gap-1"
          onClick={(e) => e.stopPropagation()}>
          <Dialog>
            <IconTip label="색상 변경">
              <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="색상" className="text-muted-foreground" />}>
                <Palette className="h-4 w-4" />
              </DialogTrigger>
            </IconTip>
            <DialogContent className="sm:max-w-xs">
              <DialogHeader>
                <DialogTitle>색상</DialogTitle>
              </DialogHeader>
              <div className="flex flex-wrap gap-2">
                {MEMO_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    aria-label={c.label}
                    onClick={() => handleColor(memo, c.value)}
                    className={`h-8 w-8 rounded-full border ${c.swatch} ${memo.color === c.value ? "ring-brand ring-2 ring-offset-1" : ""}`}>
                    {memo.color === c.value && <Check className="text-foreground/70 mx-auto h-4 w-4" />}
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          <IconTip label={memo.is_archived ? "보관 해제" : "보관함으로 이동"}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={memo.is_archived ? "보관 해제" : "보관"}
              className="text-muted-foreground"
              onClick={() => handleArchive(memo)}>
              {memo.is_archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            </Button>
          </IconTip>

          <AlertDialog>
            <IconTip label="삭제">
              <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="삭제" className="text-muted-foreground" />}>
                <Trash2 className="h-4 w-4" />
              </AlertDialogTrigger>
            </IconTip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>메모 삭제</AlertDialogTitle>
                <AlertDialogDescription>이 메모를 삭제할까요? 되돌릴 수 없습니다.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleDelete(memo.id)} className="bg-destructive hover:bg-destructive/90 text-white">
                  삭제
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    );
  }

  if (initialError) {
    return (
      <p className="text-destructive py-12 text-center text-sm" role="alert">
        {initialError}
      </p>
    );
  }

  return (
    <TooltipProvider delay={300}>
      <div className="flex flex-col gap-4">
        {/* 툴바 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-40 flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="메모 검색" className="h-9 pl-8" />
          </div>
          <Button variant={view === "active" ? "brand" : "outline"} size="sm" onClick={() => setView("active")}>
            메모
          </Button>
          <Button variant={view === "archived" ? "brand" : "outline"} size="sm" onClick={() => setView("archived")}>
            보관함 {archivedCount > 0 && archivedCount}
          </Button>
        </div>

        {/* 빠른 작성 바 */}
        <Card className={memoColor(draftColor).card}>
          <CardContent className="py-3">
            {composing ? (
              <div className="flex flex-col gap-2">
                <Input
                  value={draftTitle}
                  maxLength={MAX_MEMO_TITLE}
                  placeholder="제목"
                  onChange={(e) => setDraftTitle(e.target.value)}
                  className="h-9 border-none px-0 font-semibold shadow-none focus-visible:ring-0"
                />
                <textarea
                  autoFocus
                  value={draftContent}
                  rows={4}
                  maxLength={MAX_MEMO_CONTENT}
                  placeholder="메모 작성..."
                  onChange={(e) => setDraftContent(e.target.value)}
                  className="w-full resize-y bg-transparent text-sm leading-relaxed outline-none"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {MEMO_COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        aria-label={c.label}
                        onClick={() => setDraftColor(c.value)}
                        className={`h-6 w-6 rounded-full border ${c.swatch} ${draftColor === c.value ? "ring-brand ring-2 ring-offset-1" : ""}`}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={resetDraft} disabled={saving}>
                      닫기
                    </Button>
                    <Button variant="brand" size="sm" onClick={handleCreate} disabled={saving}>
                      {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                      저장
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setComposing(true)} className="text-muted-foreground w-full py-1 text-left text-sm">
                메모 작성...
              </button>
            )}
          </CardContent>
        </Card>

        {/* 그리드 */}
        {visible.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground py-10 text-center text-sm">
              {query ? "검색 결과가 없습니다." : view === "archived" ? "보관한 메모가 없습니다." : "메모가 없습니다. 위에서 첫 메모를 작성해 보세요."}
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {view === "active" && pinned.length > 0 && (
              <section>
                <h2 className="text-muted-foreground mb-2 text-xs font-semibold">고정됨</h2>
                <div className="columns-1 gap-3 sm:columns-2 lg:columns-3">{pinned.map(renderCard)}</div>
              </section>
            )}
            {others.length > 0 && (
              <section>
                {view === "active" && pinned.length > 0 && <h2 className="text-muted-foreground mb-2 text-xs font-semibold">기타</h2>}
                <div className="columns-1 gap-3 sm:columns-2 lg:columns-3">{others.map(renderCard)}</div>
              </section>
            )}
          </div>
        )}

        <MemoEditorDialog
          memo={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          onPin={(memo) => {
            handlePin(memo);
            setEditing({ ...memo, is_pinned: !memo.is_pinned });
          }}
          onArchive={(memo) => {
            handleArchive(memo);
            setEditing(null);
          }}
          onDelete={handleDelete}
        />
      </div>
    </TooltipProvider>
  );
}
