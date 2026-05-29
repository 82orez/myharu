"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MAX_TAGS, MAX_TAG_LENGTH } from "@/lib/tags";

export default function TagInput({
  value,
  onChange,
  suggestions = [],
  disabled = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  function addTag(raw: string) {
    const tag = raw.trim().slice(0, MAX_TAG_LENGTH);
    if (!tag) return;
    if (value.length >= MAX_TAGS) return;
    if (value.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, tag]);
    setDraft("");
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === "Backspace" && !draft && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  }

  // 아직 선택하지 않은 추천 태그만 datalist에 노출
  const remaining = suggestions.filter((s) => !value.some((t) => t.toLowerCase() === s.toLowerCase()));

  return (
    <div
      className="border-input bg-background focus-within:border-ring focus-within:ring-ring/20 flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 shadow-xs transition-[color,box-shadow] focus-within:ring-[3px]">
      {value.map((tag) => (
        <span key={tag} className="bg-brand/10 text-brand inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-xs font-medium">
          {tag}
          {!disabled && (
            <button type="button" onClick={() => removeTag(tag)} className="hover:bg-brand/20 rounded-full p-0.5" aria-label={`${tag} 태그 삭제`}>
              <X size={12} />
            </button>
          )}
        </span>
      ))}
      <Input
        list={listId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => addTag(draft)}
        disabled={disabled || value.length >= MAX_TAGS}
        placeholder={value.length >= MAX_TAGS ? `최대 ${MAX_TAGS}개` : value.length === 0 ? "예: 비즈니스, 여행 (Enter)" : "추가…"}
        maxLength={MAX_TAG_LENGTH}
        className="h-7 min-w-[7rem] flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
      />
      <datalist id={listId}>
        {remaining.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
