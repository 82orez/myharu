"use client";

import { useState, useTransition } from "react";
import { X, Loader2, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setTagPresets, renameTag } from "@/app/(learn)/learn/tag-actions";
import { MAX_TAG_LENGTH } from "@/lib/tags";
import { tagColorClass } from "@/lib/tag-color";
import { toast } from "sonner";

// 태그 프리셋 추가/이름 변경/삭제 UI. TagPicker의 "태그 관리" Dialog와 설정 페이지가 공유한다.
export default function TagManager({
  presets,
  onPresetsChange,
  onRemoved,
  onRenamed,
  disabled = false,
}: {
  presets: string[];
  onPresetsChange: (next: string[]) => void;
  onRemoved?: (tag: string) => void;
  onRenamed?: (oldName: string, newName: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [pending, startTransition] = useTransition();

  function addPreset(raw: string) {
    const tag = raw.trim().slice(0, MAX_TAG_LENGTH);
    if (!tag) return;
    if (presets.some((p) => p.toLowerCase() === tag.toLowerCase())) return;
    startTransition(async () => {
      const result = await setTagPresets([...presets, tag]);
      if (result.error || !result.presets) {
        toast.error(result.error ?? "태그 저장에 실패했습니다.");
        return;
      }
      onPresetsChange(result.presets);
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
      onRemoved?.(tag);
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
      onRenamed?.(oldName, result.newName);
      setEditingTag(null);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addPreset(draft);
              setDraft("");
            }
          }}
          disabled={disabled || pending}
          placeholder="새 태그 이름 (Enter)"
          maxLength={MAX_TAG_LENGTH}
          className="h-9 flex-1"
        />
        <Button
          type="button"
          variant="brand"
          size="sm"
          disabled={disabled || pending || !draft.trim()}
          onClick={() => {
            addPreset(draft);
            setDraft("");
          }}
        >
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
                  disabled={disabled || pending}
                  onClick={() => {
                    setEditingTag(tag);
                    setRenameDraft(tag);
                  }}
                  className="hover:bg-muted text-muted-foreground hover:text-brand rounded-md p-1.5"
                  aria-label={`${tag} 이름 변경`}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  disabled={disabled || pending}
                  onClick={() => removePreset(tag)}
                  className="hover:bg-destructive/15 text-muted-foreground hover:text-destructive rounded-md p-1.5"
                  aria-label={`${tag} 삭제`}
                >
                  <X size={14} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
