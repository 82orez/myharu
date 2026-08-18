"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { MAX_TODO_NOTE, MAX_TODO_TITLE, isValidPriority, isValidRepeat, nextDueDate, todayKST, type TodoPriority, type TodoRepeat } from "@/lib/todo";
import type { Tables, TablesUpdate } from "@/types/database.types";

// DB의 priority/repeat는 CHECK 제약이 붙은 text라 앱 쪽 유니온으로 좁혀 쓴다
export type Todo = Omit<Tables<"todos">, "user_id" | "priority" | "repeat"> & {
  priority: TodoPriority;
  repeat: TodoRepeat;
};

const SELECT = "id, title, note, is_done, priority, due_date, repeat, position, created_at, completed_at";

// DB row → 앱 타입(제약을 벗어난 값이 들어와도 기본값으로 접는다)
function toTodo(row: Omit<Tables<"todos">, "user_id">): Todo {
  return {
    ...row,
    priority: isValidPriority(row.priority) ? row.priority : "normal",
    repeat: isValidRepeat(row.repeat) ? row.repeat : "none",
  };
}

async function getClient() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function getTodos(): Promise<{ todos?: Todo[]; error?: string }> {
  const { supabase, user } = await getClient();
  if (!user) return { error: "로그인이 필요합니다." };

  // 정렬·필터는 클라이언트가 담당한다(lib/todo.ts 공용) — 여기선 안정적인 기본 순서만 준다
  const { data, error } = await supabase.from("todos").select(SELECT).eq("user_id", user.id).order("position", { ascending: true });

  if (error) {
    console.error("[Supabase DB] 할 일 조회 실패:", error);
    return { error: "할 일 목록을 불러오는 중 오류가 발생했습니다." };
  }
  return { todos: (data ?? []).map(toTodo) };
}

export type NewTodo = {
  title: string;
  note?: string;
  priority?: TodoPriority;
  dueDate?: string | null;
  repeat?: TodoRepeat;
};

export async function addTodo(input: NewTodo): Promise<{ todo?: Todo; error?: string }> {
  const { supabase, user } = await getClient();
  if (!user) return { error: "로그인이 필요합니다." };

  const title = input.title.trim().slice(0, MAX_TODO_TITLE);
  if (!title) return { error: "할 일 내용을 입력해 주세요." };

  // 새 항목은 맨 위로 — 현재 최소 position보다 1 작게(재배치 없이 삽입)
  const { data: head } = await supabase.from("todos").select("position").eq("user_id", user.id).order("position", { ascending: true }).limit(1);
  const position = (head?.[0]?.position ?? 0) - 1;

  const { data, error } = await supabase
    .from("todos")
    .insert({
      user_id: user.id,
      title,
      note: (input.note ?? "").slice(0, MAX_TODO_NOTE),
      priority: isValidPriority(input.priority) ? input.priority : "normal",
      due_date: input.dueDate || null,
      repeat: isValidRepeat(input.repeat) ? input.repeat : "none",
      position,
    })
    .select(SELECT)
    .single();

  if (error || !data) {
    console.error("[Supabase DB] 할 일 추가 실패:", error);
    return { error: "할 일을 추가하는 중 오류가 발생했습니다." };
  }
  return { todo: toTodo(data) };
}

export type TodoPatch = {
  title?: string;
  note?: string;
  priority?: TodoPriority;
  dueDate?: string | null;
  repeat?: TodoRepeat;
};

export async function updateTodo(id: string, patch: TodoPatch): Promise<{ todo?: Todo; error?: string }> {
  const { supabase, user } = await getClient();
  if (!user) return { error: "로그인이 필요합니다." };

  // 생성 타입(TablesUpdate)에 맞춰야 .update()가 스키마 검증을 해 준다
  const update: TablesUpdate<"todos"> = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim().slice(0, MAX_TODO_TITLE);
    if (!title) return { error: "할 일 내용을 입력해 주세요." };
    update.title = title;
  }
  if (patch.note !== undefined) update.note = patch.note.slice(0, MAX_TODO_NOTE);
  if (patch.priority !== undefined && isValidPriority(patch.priority)) update.priority = patch.priority;
  if (patch.repeat !== undefined && isValidRepeat(patch.repeat)) update.repeat = patch.repeat;
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate || null;

  if (Object.keys(update).length === 0) return { error: "변경할 내용이 없습니다." };

  const { data, error } = await supabase.from("todos").update(update).eq("id", id).eq("user_id", user.id).select(SELECT).single();

  if (error || !data) {
    console.error("[Supabase DB] 할 일 수정 실패:", error);
    return { error: "할 일을 수정하는 중 오류가 발생했습니다." };
  }
  return { todo: toTodo(data) };
}

/**
 * 완료 토글.
 * ⚠️ 반복 할 일을 완료하면 **행을 재사용해 다음 주기로 민다**(새 인스턴스를 만들지 않는다) —
 * 완료 목록이 반복 항목으로 채워지지 않게 하려는 의도적 선택.
 */
export async function toggleTodo(id: string, done: boolean): Promise<{ todo?: Todo; error?: string }> {
  const { supabase, user } = await getClient();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data: current, error: readError } = await supabase.from("todos").select(SELECT).eq("id", id).eq("user_id", user.id).single();
  if (readError || !current) {
    console.error("[Supabase DB] 할 일 조회 실패:", readError);
    return { error: "할 일을 찾을 수 없습니다." };
  }

  const repeat = isValidRepeat(current.repeat) ? current.repeat : "none";
  const update =
    done && repeat !== "none"
      ? { due_date: nextDueDate(current.due_date ?? todayKST(), repeat), is_done: false, completed_at: new Date().toISOString() }
      : { is_done: done, completed_at: done ? new Date().toISOString() : null };

  const { data, error } = await supabase.from("todos").update(update).eq("id", id).eq("user_id", user.id).select(SELECT).single();

  if (error || !data) {
    console.error("[Supabase DB] 할 일 상태 변경 실패:", error);
    return { error: "할 일 상태를 바꾸는 중 오류가 발생했습니다." };
  }
  return { todo: toTodo(data) };
}

/** 수동 정렬 이동 — 이웃 두 값의 중간값을 받아 한 행만 갱신한다. */
export async function moveTodo(id: string, position: number): Promise<{ error?: string }> {
  const { supabase, user } = await getClient();
  if (!user) return { error: "로그인이 필요합니다." };
  if (!Number.isFinite(position)) return { error: "잘못된 위치입니다." };

  const { error } = await supabase.from("todos").update({ position }).eq("id", id).eq("user_id", user.id);
  if (error) {
    console.error("[Supabase DB] 할 일 순서 변경 실패:", error);
    return { error: "순서를 변경하는 중 오류가 발생했습니다." };
  }
  return {};
}

export async function deleteTodo(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await getClient();
  if (!user) return { error: "로그인이 필요합니다." };

  const { error } = await supabase.from("todos").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    console.error("[Supabase DB] 할 일 삭제 실패:", error);
    return { error: "할 일을 삭제하는 중 오류가 발생했습니다." };
  }
  return {};
}

export async function clearCompletedTodos(): Promise<{ deleted?: number; error?: string }> {
  const { supabase, user } = await getClient();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data, error } = await supabase.from("todos").delete().eq("user_id", user.id).eq("is_done", true).select("id");
  if (error) {
    console.error("[Supabase DB] 완료 항목 정리 실패:", error);
    return { error: "완료 항목을 정리하는 중 오류가 발생했습니다." };
  }
  return { deleted: data?.length ?? 0 };
}
