"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { Plus, Circle, CheckCircle2, Trash2, StickyNote, Repeat, ChevronDown, ChevronUp, GripVertical, CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import {
  MAX_TODO_NOTE,
  MAX_TODO_TITLE,
  PRIORITIES,
  REPEATS,
  TODO_SORTS,
  TODO_VIEWS,
  filterTodos,
  isDueToday,
  isOverdue,
  priorityMeta,
  repeatLabel,
  sortTodos,
  todayKST,
  type TodoPriority,
  type TodoRepeat,
  type TodoSort,
  type TodoView,
} from "@/lib/todo";
import { addTodo, clearCompletedTodos, deleteTodo, moveTodo, toggleTodo, updateTodo, type Todo, type TodoPatch } from "@/app/(learn)/todo/actions";

const selectClass =
  "border-input bg-background ring-ring/10 focus-visible:border-ring focus-visible:ring-ring/20 h-9 rounded-md border px-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]";

// 마감일 배지 색: 지난 것 > 오늘 > 그 외
function dueClass(due: string | null, today: string): string {
  if (isOverdue(due, today)) return "text-destructive";
  if (isDueToday(due, today)) return "text-accent-orange";
  return "text-muted-foreground";
}

function dueLabel(due: string, today: string): string {
  if (isDueToday(due, today)) return "오늘";
  const [, m, d] = due.split("-");
  return `${Number(m)}/${Number(d)}`;
}

// 아이콘 버튼 설명(MemoClient의 IconTip과 같은 구조 — base-ui 트리거는 단일 엘리먼트여야 한다)
function IconTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export default function TodoClient({ initialTodos, initialError }: { initialTodos: Todo[]; initialError?: string }) {
  const [todos, setTodos] = useState<Todo[]>(initialTodos);
  const [view, setView] = useState<TodoView>("all");
  const [sort, setSort] = useState<TodoSort>("manual");

  // 입력 바
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TodoPriority>("normal");
  const [repeat, setRepeat] = useState<TodoRepeat>("none");
  const [detailOpen, setDetailOpen] = useState(false);
  const [adding, startAdding] = useTransition();

  // 행 상태
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [noteOpenIds, setNoteOpenIds] = useState<Set<string>>(new Set());
  const [doneOpen, setDoneOpen] = useState(false);
  const [clearing, startClearing] = useTransition();
  const dragIdRef = useRef<string | null>(null);

  const today = todayKST();

  const patchLocal = useCallback((id: string, patch: Partial<Todo>) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const activeCount = todos.filter((t) => !t.is_done).length;
  const doneCount = todos.length - activeCount;

  // 보기·정렬은 순수 로직(lib/todo.ts) 공용 — 여기서 다시 구현하지 말 것
  const visible = useMemo(() => sortTodos(filterTodos(todos, view, today), sort), [todos, view, sort, today]);
  const openItems = visible.filter((t) => !t.is_done);
  const doneItems = visible.filter((t) => t.is_done);

  function handleAdd() {
    const text = title.trim();
    if (!text || adding) return;
    startAdding(async () => {
      const result = await addTodo({ title: text, dueDate: dueDate || null, priority, repeat });
      if (result.error || !result.todo) {
        toast.error(result.error ?? "할 일을 추가하지 못했습니다.");
        return;
      }
      setTodos((prev) => [result.todo!, ...prev]);
      setTitle("");
      setDueDate("");
      setPriority("normal");
      setRepeat("none");
    });
  }

  function handleToggle(todo: Todo) {
    const next = !todo.is_done;
    // 반복 할 일은 서버가 다음 주기로 밀어 주므로 낙관적 갱신 없이 결과를 반영한다
    if (todo.repeat !== "none" && next) {
      void toggleTodo(todo.id, next).then((result) => {
        if (result.error || !result.todo) {
          toast.error(result.error ?? "상태를 바꾸지 못했습니다.");
          return;
        }
        patchLocal(todo.id, result.todo);
        toast.success(`다음 ${result.todo.due_date ?? ""} 로 넘겼습니다.`);
      });
      return;
    }
    patchLocal(todo.id, { is_done: next });
    void toggleTodo(todo.id, next).then((result) => {
      if (result.error) {
        patchLocal(todo.id, { is_done: !next });
        toast.error(result.error);
      }
    });
  }

  function handlePatch(todo: Todo, patch: TodoPatch, local: Partial<Todo>) {
    const before = { ...todo };
    patchLocal(todo.id, local);
    void updateTodo(todo.id, patch).then((result) => {
      if (result.error) {
        patchLocal(todo.id, before);
        toast.error(result.error);
      }
    });
  }

  function handleDelete(id: string) {
    const before = todos;
    setTodos((prev) => prev.filter((t) => t.id !== id));
    void deleteTodo(id).then((result) => {
      if (result.error) {
        setTodos(before);
        toast.error(result.error);
      }
    });
  }

  function handleClearCompleted() {
    const before = todos;
    startClearing(async () => {
      const result = await clearCompletedTodos();
      if (result.error) {
        setTodos(before);
        toast.error(result.error);
        return;
      }
      setTodos((prev) => prev.filter((t) => !t.is_done));
      toast.success(`완료 항목 ${(result.deleted ?? 0).toLocaleString()}개를 정리했습니다.`);
    });
  }

  /**
   * 수동 정렬 이동. 이웃 두 항목의 position 중간값을 계산해 **한 행만** 갱신한다.
   * (전체 재배치를 하지 않으려고 position을 double로 뒀다 — lib 주석·마이그레이션 참고)
   */
  function moveTo(id: string, targetIndex: number) {
    const list = openItems;
    const from = list.findIndex((t) => t.id === id);
    if (from < 0 || targetIndex < 0 || targetIndex >= list.length || from === targetIndex) return;

    const without = list.filter((t) => t.id !== id);
    const prev = without[targetIndex - 1];
    const next = without[targetIndex];
    const position = prev && next ? (prev.position + next.position) / 2 : prev ? prev.position + 1 : next ? next.position - 1 : 0;

    patchLocal(id, { position });
    void moveTodo(id, position).then((result) => {
      if (result.error) toast.error(result.error);
    });
  }

  function commitEdit(todo: Todo) {
    const next = editDraft.trim().slice(0, MAX_TODO_TITLE);
    setEditingId(null);
    if (!next || next === todo.title) return;
    handlePatch(todo, { title: next }, { title: next });
  }

  function toggleNote(id: string) {
    setNoteOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderRow(todo: Todo, index: number, manualSortable: boolean) {
    const isEditing = editingId === todo.id;
    const noteOpen = noteOpenIds.has(todo.id);
    const meta = priorityMeta(todo.priority);

    return (
      <li
        key={todo.id}
        draggable={manualSortable && !isEditing}
        onDragStart={() => (dragIdRef.current = todo.id)}
        onDragOver={(e) => manualSortable && e.preventDefault()}
        onDrop={() => {
          if (!manualSortable || !dragIdRef.current) return;
          moveTo(dragIdRef.current, index);
          dragIdRef.current = null;
        }}
        className="border-border flex flex-col gap-2 border-b py-2 last:border-b-0">
        <div className="flex items-center gap-2">
          {manualSortable && (
            <div className="text-muted-foreground/60 flex shrink-0 flex-col">
              {/* HTML5 드래그는 모바일에서 동작하지 않는다 — ↑↓ 버튼을 함께 제공할 것 */}
              <IconTip label="위로 이동">
                <button
                  type="button"
                  aria-label="위로"
                  disabled={index === 0}
                  onClick={() => moveTo(todo.id, index - 1)}
                  className="disabled:opacity-30">
                  <ChevronUp className="h-4 w-4" />
                </button>
              </IconTip>
              <IconTip label="아래로 이동">
                <button
                  type="button"
                  aria-label="아래로"
                  disabled={index === openItems.length - 1}
                  onClick={() => moveTo(todo.id, index + 1)}
                  className="disabled:opacity-30">
                  <ChevronDown className="h-4 w-4" />
                </button>
              </IconTip>
            </div>
          )}
          {manualSortable && (
            <IconTip label="끌어서 순서 변경">
              <GripVertical className="text-muted-foreground/40 hidden h-4 w-4 shrink-0 cursor-grab md:block" />
            </IconTip>
          )}

          <IconTip label={todo.is_done ? "완료 취소" : todo.repeat !== "none" ? "완료(다음 주기로 넘김)" : "완료로 표시"}>
            <button
              type="button"
              aria-label={todo.is_done ? "완료 취소" : "완료"}
              onClick={() => handleToggle(todo)}
              className={todo.is_done ? "text-success shrink-0" : "text-muted-foreground hover:text-brand shrink-0"}>
              {todo.is_done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
            </button>
          </IconTip>

          {isEditing ? (
            <Input
              autoFocus
              value={editDraft}
              maxLength={MAX_TODO_TITLE}
              onChange={(e) => setEditDraft(e.target.value)}
              onBlur={() => commitEdit(todo)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitEdit(todo);
                } else if (e.key === "Escape") {
                  setEditingId(null);
                }
              }}
              className="h-8 flex-1"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingId(todo.id);
                setEditDraft(todo.title);
              }}
              className={`flex-1 truncate text-left text-sm ${todo.is_done ? "text-muted-foreground line-through" : ""}`}>
              {todo.title}
            </button>
          )}

          {todo.priority !== "normal" && <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge}`}>{meta.label}</span>}
          {todo.due_date && (
            <span className={`shrink-0 text-xs font-medium tabular-nums ${dueClass(todo.due_date, today)}`}>{dueLabel(todo.due_date, today)}</span>
          )}
          {todo.repeat !== "none" && (
            <IconTip label={`${repeatLabel(todo.repeat)} 반복`}>
              <Repeat className="text-muted-foreground/70 h-3.5 w-3.5 shrink-0" />
            </IconTip>
          )}

          <IconTip label={noteOpen ? "메모 닫기" : todo.note ? "메모 보기" : "메모·상세 설정"}>
            <button
              type="button"
              aria-label="메모"
              onClick={() => toggleNote(todo.id)}
              className={`shrink-0 ${noteOpen ? "text-brand" : todo.note ? "text-foreground" : "text-muted-foreground/40"}`}>
              <StickyNote className="h-4 w-4" />
            </button>
          </IconTip>

          <AlertDialog>
            <IconTip label="삭제">
              <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="삭제" className="text-muted-foreground shrink-0" />}>
                <Trash2 className="h-4 w-4" />
              </AlertDialogTrigger>
            </IconTip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>할 일 삭제</AlertDialogTitle>
                <AlertDialogDescription>&ldquo;{todo.title}&rdquo; 를 삭제할까요? 되돌릴 수 없습니다.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleDelete(todo.id)} className="bg-destructive hover:bg-destructive/90 text-white">
                  삭제
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {noteOpen && (
          <div className="flex flex-col gap-2 pl-7">
            <textarea
              value={todo.note}
              rows={2}
              maxLength={MAX_TODO_NOTE}
              placeholder="메모"
              onChange={(e) => patchLocal(todo.id, { note: e.target.value.slice(0, MAX_TODO_NOTE) })}
              onBlur={(e) => handlePatch(todo, { note: e.target.value }, { note: e.target.value })}
              className="border-input focus-visible:ring-ring/50 w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2"
            />
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={todo.priority}
                onChange={(e) => handlePatch(todo, { priority: e.target.value as TodoPriority }, { priority: e.target.value as TodoPriority })}
                aria-label="우선순위"
                className={selectClass}>
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={todo.due_date ?? ""}
                onChange={(e) => handlePatch(todo, { dueDate: e.target.value || null }, { due_date: e.target.value || null })}
                aria-label="마감일"
                className={selectClass}
              />
              <select
                value={todo.repeat}
                onChange={(e) => handlePatch(todo, { repeat: e.target.value as TodoRepeat }, { repeat: e.target.value as TodoRepeat })}
                aria-label="반복"
                className={selectClass}>
                {REPEATS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </li>
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
        {/* 입력 바 */}
        <Card>
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="flex gap-2">
              <Input
                value={title}
                maxLength={MAX_TODO_TITLE}
                placeholder="할 일을 입력하세요"
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
                className="h-10 flex-1"
              />
              <Button variant="brand" disabled={!title.trim() || adding} onClick={handleAdd} className="h-10 px-4">
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                추가
              </Button>
            </div>

            <button type="button" onClick={() => setDetailOpen((v) => !v)} className="text-muted-foreground self-start text-xs">
              상세 {detailOpen ? "접기" : "설정"} {detailOpen ? "▲" : "▼"}
            </button>

            {detailOpen && (
              <div className="flex flex-wrap items-center gap-2">
                <select value={priority} onChange={(e) => setPriority(e.target.value as TodoPriority)} aria-label="우선순위" className={selectClass}>
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="마감일" className={selectClass} />
                <select value={repeat} onChange={(e) => setRepeat(e.target.value as TodoRepeat)} aria-label="반복" className={selectClass}>
                  {REPEATS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 보기 / 정렬 */}
        <div className="flex flex-wrap items-center gap-2">
          {TODO_VIEWS.map((v) => (
            <Button key={v.value} variant={view === v.value ? "brand" : "outline"} size="sm" onClick={() => setView(v.value)}>
              {v.label}
            </Button>
          ))}
          <select value={sort} onChange={(e) => setSort(e.target.value as TodoSort)} aria-label="정렬" className={`${selectClass} ml-auto h-8`}>
            {TODO_SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <p className="text-muted-foreground text-sm">
          남은 일 <span className="text-foreground font-semibold tabular-nums">{activeCount}</span> · 완료{" "}
          <span className="font-semibold tabular-nums">{doneCount}</span>
        </p>

        {/* 목록 */}
        {todos.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground py-10 text-center text-sm">할 일이 없습니다. 위에서 추가해 보세요.</CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-2">
              {openItems.length === 0 && doneItems.length === 0 && (
                <p className="text-muted-foreground py-6 text-center text-sm">조건에 맞는 할 일이 없습니다.</p>
              )}
              <ul className="flex flex-col">{openItems.map((todo, i) => renderRow(todo, i, sort === "manual" && view !== "done"))}</ul>

              {doneItems.length > 0 && (
                <div className="border-border mt-2 border-t pt-2">
                  <button type="button" onClick={() => setDoneOpen((v) => !v)} className="text-muted-foreground flex items-center gap-1 py-1 text-xs">
                    {doneOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    완료 {doneItems.length}개 {doneOpen ? "숨기기" : "보기"}
                  </button>
                  {doneOpen && <ul className="flex flex-col opacity-70">{doneItems.map((todo, i) => renderRow(todo, i, false))}</ul>}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {doneCount > 0 && (
          <div className="flex justify-end">
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="ghost" size="sm" disabled={clearing} className="text-muted-foreground" />}>
                {clearing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
                완료 항목 정리
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>완료 항목 정리</AlertDialogTitle>
                  <AlertDialogDescription>완료한 할 일 {doneCount}개를 삭제합니다. 되돌릴 수 없습니다.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearCompleted} className="bg-destructive hover:bg-destructive/90 text-white">
                    정리
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        <p className="text-muted-foreground/70 flex items-center justify-center gap-1 text-xs">
          <CalendarDays className="h-3 w-3" />
          마감일·오늘 판정은 한국 시간 기준입니다.
        </p>
      </div>
    </TooltipProvider>
  );
}
