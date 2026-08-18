// 메모(/memo) 공용 로직. 서버 액션·클라이언트가 함께 쓰므로 디렉티브 없는 순수 모듈로 둔다.

export type MemoColor = "default" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "navy" | "purple" | "pink" | "brown" | "gray";

export type MemoView = "active" | "archived";

// ⚠️ 클래스는 문자열 조합으로 만들지 말 것 — Tailwind가 스캔하려면 전체 클래스가 그대로 있어야 한다
//    (lib/tag-color.ts와 같은 이유). 프로젝트가 라이트 전용이라 dark: 유틸도 쓰지 않는다.
export const MEMO_COLORS: { value: MemoColor; label: string; card: string; swatch: string }[] = [
  { value: "default", label: "기본", card: "bg-card border-border", swatch: "bg-white border-zinc-300" },
  { value: "red", label: "빨강", card: "bg-red-50 border-red-200", swatch: "bg-red-100 border-red-300" },
  { value: "orange", label: "주황", card: "bg-orange-50 border-orange-200", swatch: "bg-orange-100 border-orange-300" },
  { value: "yellow", label: "노랑", card: "bg-yellow-50 border-yellow-200", swatch: "bg-yellow-100 border-yellow-300" },
  { value: "green", label: "초록", card: "bg-green-50 border-green-200", swatch: "bg-green-100 border-green-300" },
  { value: "teal", label: "청록", card: "bg-teal-50 border-teal-200", swatch: "bg-teal-100 border-teal-300" },
  { value: "blue", label: "파랑", card: "bg-sky-50 border-sky-200", swatch: "bg-sky-100 border-sky-300" },
  { value: "navy", label: "남색", card: "bg-indigo-50 border-indigo-200", swatch: "bg-indigo-100 border-indigo-300" },
  { value: "purple", label: "보라", card: "bg-purple-50 border-purple-200", swatch: "bg-purple-100 border-purple-300" },
  { value: "pink", label: "분홍", card: "bg-pink-50 border-pink-200", swatch: "bg-pink-100 border-pink-300" },
  { value: "brown", label: "갈색", card: "bg-amber-50 border-amber-200", swatch: "bg-amber-100 border-amber-300" },
  { value: "gray", label: "회색", card: "bg-zinc-100 border-zinc-200", swatch: "bg-zinc-200 border-zinc-400" },
];

export const MAX_MEMO_TITLE = 200;
export const MAX_MEMO_CONTENT = 10000;

export const isValidMemoColor = (v: unknown): v is MemoColor => MEMO_COLORS.some((c) => c.value === v);

/** 알 수 없는 색은 기본값으로 접는다(DB CHECK를 벗어난 값 방어). */
export const memoColor = (v: string) => MEMO_COLORS.find((c) => c.value === v) ?? MEMO_COLORS[0];

export const isEmptyMemo = (title: string, content: string): boolean => !title.trim() && !content.trim();

export type SortableMemo = {
  is_pinned: boolean;
  is_archived: boolean;
  title: string;
  content: string;
  updated_at: string;
};

/** 고정 먼저 → 최근 수정 순. */
export function sortMemos<T extends SortableMemo>(list: T[]): T[] {
  return list.slice().sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return b.updated_at.localeCompare(a.updated_at);
  });
}

export function filterMemos<T extends SortableMemo>(list: T[], view: MemoView, query: string): T[] {
  const q = query.trim().toLowerCase();
  return list.filter((m) => {
    if (view === "archived" ? !m.is_archived : m.is_archived) return false;
    if (!q) return true;
    return m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q);
  });
}
