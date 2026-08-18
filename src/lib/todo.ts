// 할 일(/todo) 공용 로직. 서버 액션·클라이언트가 함께 쓰므로 디렉티브 없는 순수 모듈로 둔다.

export type TodoPriority = "low" | "normal" | "high";
export type TodoRepeat = "none" | "daily" | "weekly" | "monthly";
export type TodoSort = "manual" | "due" | "priority" | "latest";
export type TodoView = "all" | "active" | "today" | "done";

// ⚠️ 배지 클래스는 문자열 조합으로 만들지 말 것 — Tailwind가 스캔하려면 전체 클래스가 그대로 있어야 한다
// (lib/tag-color.ts와 같은 이유).
export const PRIORITIES: { value: TodoPriority; label: string; badge: string; rank: number }[] = [
  { value: "high", label: "높음", badge: "bg-destructive/10 text-destructive", rank: 0 },
  { value: "normal", label: "보통", badge: "bg-muted text-muted-foreground", rank: 1 },
  { value: "low", label: "낮음", badge: "bg-muted/60 text-muted-foreground/80", rank: 2 },
];

export const REPEATS: { value: TodoRepeat; label: string }[] = [
  { value: "none", label: "반복 없음" },
  { value: "daily", label: "매일" },
  { value: "weekly", label: "매주" },
  { value: "monthly", label: "매월" },
];

export const TODO_SORTS: { value: TodoSort; label: string }[] = [
  { value: "manual", label: "직접 정렬" },
  { value: "due", label: "마감일순" },
  { value: "priority", label: "우선순위순" },
  { value: "latest", label: "최신순" },
];

export const TODO_VIEWS: { value: TodoView; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "active", label: "남은 일" },
  { value: "today", label: "오늘" },
  { value: "done", label: "완료" },
];

export const MAX_TODO_TITLE = 200;
export const MAX_TODO_NOTE = 1000;

export const isValidPriority = (v: unknown): v is TodoPriority => PRIORITIES.some((p) => p.value === v);
export const isValidRepeat = (v: unknown): v is TodoRepeat => REPEATS.some((r) => r.value === v);

export const priorityMeta = (v: TodoPriority) => PRIORITIES.find((p) => p.value === v) ?? PRIORITIES[1];
export const repeatLabel = (v: TodoRepeat) => REPEATS.find((r) => r.value === v)?.label ?? "반복 없음";

// 날짜는 모두 KST 기준 `YYYY-MM-DD` 문자열로 다룬다(sentence-filter.ts의 kstDate와 같은 방식).
export const todayKST = (): string => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export const isOverdue = (due: string | null, today = todayKST()): boolean => !!due && due < today;
export const isDueToday = (due: string | null, today = todayKST()): boolean => !!due && due === today;

/** 반복 주기의 다음 마감일. `base`가 오늘보다 과거여도 최소 하루는 앞으로 민다. */
export function nextDueDate(base: string, repeat: TodoRepeat): string {
  if (repeat === "none") return base;
  // 정오 기준으로 계산해 서머타임·타임존 경계에서 날짜가 밀리지 않게 한다
  const d = new Date(`${base}T12:00:00Z`);
  if (repeat === "daily") d.setUTCDate(d.getUTCDate() + 1);
  if (repeat === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  if (repeat === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

// 정렬·필터가 필요로 하는 최소 형태(DB Row도 이 모양을 만족한다)
export type SortableTodo = {
  id: string;
  is_done: boolean;
  priority: TodoPriority;
  due_date: string | null;
  position: number;
  created_at: string;
};

export function sortTodos<T extends SortableTodo>(list: T[], sort: TodoSort): T[] {
  const out = list.slice();
  const byCreated = (a: T, b: T) => b.created_at.localeCompare(a.created_at);
  if (sort === "manual") return out.sort((a, b) => a.position - b.position || byCreated(a, b));
  if (sort === "latest") return out.sort(byCreated);
  if (sort === "priority") return out.sort((a, b) => priorityMeta(a.priority).rank - priorityMeta(b.priority).rank || byCreated(a, b));
  // 마감일순 — 기한 없는 항목은 항상 뒤로
  return out.sort((a, b) => {
    if (a.due_date === b.due_date) return byCreated(a, b);
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  });
}

export function filterTodos<T extends SortableTodo>(list: T[], view: TodoView, today = todayKST()): T[] {
  if (view === "all") return list;
  if (view === "done") return list.filter((t) => t.is_done);
  if (view === "active") return list.filter((t) => !t.is_done);
  // 오늘 = 오늘 마감 + 이미 지난 것(남은 일 중에서만)
  return list.filter((t) => !t.is_done && (isDueToday(t.due_date, today) || isOverdue(t.due_date, today)));
}
