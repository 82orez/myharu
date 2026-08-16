"use client";

import { useMemo } from "react";
import { Search, Star, Tag, ArrowLeftRight, X, ChevronDown, SlidersHorizontal, Circle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tagChipClass } from "@/lib/tag-color";
import { DAY_RANGES, EMPTY_FILTER, QUIZ_ORDERS, parseNumberRanges, type DayRange, type QuizOrder, type SentenceFilter } from "@/lib/sentence-filter";
import type { Sentence } from "@/app/(learn)/learn/review/actions";

// 한 세션 문제 수 제한 (0 = 전체)
export const QUIZ_LIMITS = [0, 10, 20, 30, 50] as const;

const selectClass =
  "border-input bg-background ring-ring/10 focus-visible:border-ring focus-visible:ring-ring/20 h-8 rounded-md border px-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]";

export default function QuizFilterPanel({
  sentences,
  filter,
  onFilterChange,
  numberInput,
  onNumberInputChange,
  order,
  onOrderChange,
  limit,
  onLimitChange,
  matchedCount,
  open,
  onOpenChange,
}: {
  sentences: Sentence[];
  filter: SentenceFilter;
  onFilterChange: (next: SentenceFilter) => void;
  // 순번 입력은 원문 문자열을 그대로 들고 있어야 "1-20, " 같은 입력 도중 상태가 안 깨진다
  numberInput: string;
  onNumberInputChange: (value: string) => void;
  order: QuizOrder;
  onOrderChange: (order: QuizOrder) => void;
  limit: number;
  onLimitChange: (limit: number) => void;
  matchedCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const s of sentences) for (const t of s.tags) set.add(t);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [sentences]);

  const hasUntagged = sentences.some((s) => s.tags.length === 0);
  const { invalid: numberInvalid } = parseNumberRanges(numberInput);
  const patch = (p: Partial<SentenceFilter>) => onFilterChange({ ...filter, ...p });

  const toggleTag = (t: string) =>
    patch({ noTagOnly: false, tags: filter.tags.includes(t) ? filter.tags.filter((x) => x !== t) : [...filter.tags, t] });

  const isDefault =
    filter.dayRange === "all" &&
    !filter.favoriteOnly &&
    !filter.unpracticedOnly &&
    !filter.noTagOnly &&
    filter.tags.length === 0 &&
    !filter.search &&
    !numberInput.trim() &&
    limit === 0;

  return (
    <div className="w-full max-w-md">
      <Button variant={open || !isDefault ? "brand" : "outline"} onClick={() => onOpenChange(!open)} className="w-full justify-between">
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          출제 범위 · {matchedCount}문장
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>

      {open && (
        <div className="border-border mt-3 flex flex-col gap-3 rounded-xl border p-4 text-left">
          {/* 조건 · 출제 방식 */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filter.dayRange}
              onChange={(e) => patch({ dayRange: e.target.value as DayRange })}
              aria-label="입력일"
              className={selectClass}>
              {DAY_RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              aria-pressed={filter.favoriteOnly}
              onClick={() => patch({ favoriteOnly: !filter.favoriteOnly })}
              className={filter.favoriteOnly ? "border-amber-500 bg-amber-500/10 text-amber-600" : "text-amber-500"}>
              <Star className={`mr-1 h-4 w-4 ${filter.favoriteOnly ? "fill-current" : ""}`} />
              즐겨찾기
            </Button>
            <Button
              variant={filter.unpracticedOnly ? "brand" : "outline"}
              size="sm"
              aria-pressed={filter.unpracticedOnly}
              onClick={() => patch({ unpracticedOnly: !filter.unpracticedOnly })}>
              <Circle className="mr-1 h-4 w-4" />
              미연습만
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select value={order} onChange={(e) => onOrderChange(e.target.value as QuizOrder)} aria-label="출제 순서" className={selectClass}>
              {QUIZ_ORDERS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select value={limit} onChange={(e) => onLimitChange(Number(e.target.value))} aria-label="문제 수" className={selectClass}>
              {QUIZ_LIMITS.map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "전체 문항" : `${n}문제`}
                </option>
              ))}
            </select>
          </div>

          {/* 순번 범위 */}
          <div className="flex flex-col gap-1">
            <Input
              type="text"
              value={numberInput}
              onChange={(e) => onNumberInputChange(e.target.value)}
              placeholder="순번 지정 · 예: 1-20, 35, 40-45"
              aria-label="순번 범위"
              aria-invalid={numberInvalid}
              className="h-9"
            />
            {numberInvalid && <p className="text-destructive text-xs">순번 형식을 확인해 주세요. 예: 1-20, 35, 40-45</p>}
          </div>

          {/* 본문 검색 */}
          <div className="relative">
            <Search size={16} className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" />
            <Input
              type="text"
              value={filter.search}
              onChange={(e) => patch({ search: e.target.value })}
              placeholder="영어 문장/한글 뜻 검색 · #12로 번호 찾기"
              className="h-9 pr-9 pl-9"
            />
            {filter.search && (
              <button
                type="button"
                onClick={() => patch({ search: "" })}
                aria-label="검색어 지우기"
                className="hover:bg-muted text-muted-foreground absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md transition-colors">
                <X size={14} />
              </button>
            )}
          </div>

          {/* 태그 — 규칙은 학습 모드와 동일(태그 선택과 "없음"은 상호 배타) */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={filter.tags.length === 0 && !filter.noTagOnly ? "brand" : "outline"}
                size="sm"
                onClick={() => patch({ tags: [], noTagOnly: false })}>
                <Tag className="mr-1 h-4 w-4" />
                전체 {matchedCount}
              </Button>
              {allTags.map((t) => (
                <Button
                  key={t}
                  variant="outline"
                  size="sm"
                  aria-pressed={filter.tags.includes(t)}
                  onClick={() => toggleTag(t)}
                  className={`${tagChipClass(t)} border-transparent ${filter.tags.includes(t) ? "ring-foreground/40 ring-2" : ""}`}>
                  {t}
                </Button>
              ))}
              {filter.tags.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`태그 조건: ${filter.tagMode === "and" ? "모두 포함" : "하나라도"} (클릭하여 전환)`}
                  onClick={() => patch({ tagMode: filter.tagMode === "and" ? "or" : "and" })}>
                  <ArrowLeftRight className="mr-1 h-4 w-4" />
                  {filter.tagMode === "and" ? "모두 포함" : "하나라도"}
                </Button>
              )}
              {hasUntagged && (
                <Button
                  variant={filter.noTagOnly ? "brand" : "outline"}
                  size="sm"
                  aria-pressed={filter.noTagOnly}
                  onClick={() => patch({ noTagOnly: !filter.noTagOnly, tags: [] })}>
                  없음
                </Button>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              disabled={isDefault}
              onClick={() => {
                onFilterChange(EMPTY_FILTER);
                onNumberInputChange("");
                onLimitChange(0);
              }}
              className="text-muted-foreground">
              <RotateCcw className="mr-1 h-4 w-4" />
              조건 초기화
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
