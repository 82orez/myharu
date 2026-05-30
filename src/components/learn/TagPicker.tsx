"use client";

import { useState, useTransition } from "react";
import { Plus, X, Settings2, Loader2, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setTagPresets, renameTag } from "@/app/(learn)/learn/tag-actions";
import { MAX_TAG_LENGTH } from "@/lib/tags";
import { tagColorClass } from "@/lib/tag-color";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export default function TagPicker({
  value,
  onChange,
  presets,
  onPresetsChange,
  onTagRenamed,
  disabled = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  presets: string[];
  onPresetsChange: (next: string[]) => void;
  onTagRenamed?: (oldName: string, newName: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [manageDraft, setManageDraft] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [pending, startTransition] = useTransition();

  // 칩으로 보여줄 목록: 프리셋 + (프리셋에 없는) 선택된 레거시 태그
  const chips = [...presets, ...value.filter((t) => !presets.some((p) => p.toLowerCase() === t.toLowerCase()))];

  const isSelected = (tag: string) => value.some((t) => t.toLowerCase() === tag.toLowerCase());

  function toggle(tag: string) {
    if (isSelected(tag)) onChange(value.filter((t) => t.toLowerCase() !== tag.toLowerCase()));
    else onChange([...value, tag]);
  }

  // 프리셋 추가(+ 선택). 이미 있으면 선택만.
  function addPreset(raw: string, alsoSelect: boolean) {
    const tag = raw.trim().slice(0, MAX_TAG_LENGTH);
    if (!tag) return;
    const existing = presets.find((p) => p.toLowerCase() === tag.toLowerCase());
    if (existing) {
      if (alsoSelect && !isSelected(existing)) onChange([...value, existing]);
      return;
    }
    startTransition(async () => {
      const result = await setTagPresets([...presets, tag]);
      if (result.error || !result.presets) {
        toast.error(result.error ?? "태그 저장에 실패했습니다.");
        return;
      }
      onPresetsChange(result.presets);
      if (alsoSelect) onChange([...value, tag]);
    });
  }

  function removePreset(tag: string) {
    startTransition(async () => {
      const result = await setTagPresets(presets.filter((p) => p !== tag));
      if (result.error || !result.presets) {
        toast.error(result.error ?? "태그 삭제에 실패했습니다.");
        return;
      }
      onPresetsChange(result.presets);
      if (isSelected(tag)) onChange(value.filter((t) => t.toLowerCase() !== tag.toLowerCase()));
    });
  }

  function commitRename(oldName: string) {
    const next = renameDraft.trim().slice(0, MAX_TAG_LENGTH);
    if (!next || next === oldName) {
      setEditingTag(null);
      return;
    }
    startTransition(async () => {
      const result = await renameTag(oldName, next);
      if (result.error || !result.newName) {
        toast.error(result.error ?? "태그 이름 변경에 실패했습니다.");
        return;
      }
      if (result.presets) onPresetsChange(result.presets);
      if (isSelected(oldName)) onChange(value.map((t) => (t === oldName ? result.newName! : t)));
      onTagRenamed?.(oldName, result.newName);
      setEditingTag(null);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.length === 0 && <span className="text-muted-foreground text-sm">아직 태그가 없어요. 아래에서 추가하세요.</span>}
        {chips.map((tag) => {
          const selected = isSelected(tag);
          return (
            <button
              key={tag}
              type="button"
              disabled={disabled}
              onClick={() => toggle(tag)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                selected ? "bg-brand text-brand-foreground" : `${tagColorClass(tag)} opacity-80 hover:opacity-100`
              }`}>
              {selected && <Check size={12} />}
              {tag}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addPreset(draft, true);
              setDraft("");
            }
          }}
          disabled={disabled || pending}
          placeholder="새 태그 추가 (Enter)"
          maxLength={MAX_TAG_LENGTH}
          className="h-8 flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || pending || !draft.trim()}
          onClick={() => {
            addPreset(draft, true);
            setDraft("");
          }}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
        <Dialog open={manageOpen} onOpenChange={setManageOpen}>
          <DialogTrigger
            render={
              <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label="태그 관리">
                <Settings2 className="h-4 w-4" />
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>태그 관리</DialogTitle>
              <DialogDescription>자주 쓰는 태그를 추가하거나 삭제하세요. 여기서 만든 태그를 문장에 선택할 수 있어요.</DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-2">
              <Input
                value={manageDraft}
                onChange={(e) => setManageDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPreset(manageDraft, false);
                    setManageDraft("");
                  }
                }}
                disabled={pending}
                placeholder="새 태그 이름 (Enter)"
                maxLength={MAX_TAG_LENGTH}
                className="h-9 flex-1"
              />
              <Button
                type="button"
                variant="brand"
                size="sm"
                disabled={pending || !manageDraft.trim()}
                onClick={() => {
                  addPreset(manageDraft, false);
                  setManageDraft("");
                }}>
                추가
              </Button>
            </div>

            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {presets.length === 0 && <span className="text-muted-foreground text-sm">등록된 태그가 없습니다.</span>}
              {presets.map((tag) => (
                <div key={tag} className="flex items-center gap-2 rounded-md px-1 py-0.5">
                  {editingTag === tag ? (
                    <>
                      <Input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitRename(tag);
                          } else if (e.key === "Escape") {
                            setEditingTag(null);
                          }
                        }}
                        disabled={pending}
                        maxLength={MAX_TAG_LENGTH}
                        className="h-8 flex-1"
                      />
                      <Button type="button" variant="brand" size="sm" disabled={pending || !renameDraft.trim()} onClick={() => commitRename(tag)}>
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setEditingTag(null)} aria-label="취소">
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className={`${tagColorClass(tag)} mr-auto inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium`}>{tag}</span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setEditingTag(tag);
                          setRenameDraft(tag);
                        }}
                        className="hover:bg-muted text-muted-foreground hover:text-brand rounded-md p-1.5"
                        aria-label={`${tag} 이름 변경`}>
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => removePreset(tag)}
                        className="hover:bg-destructive/15 text-muted-foreground hover:text-destructive rounded-md p-1.5"
                        aria-label={`${tag} 삭제`}>
                        <X size={14} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
