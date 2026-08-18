"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { MAX_MEMO_CONTENT, MAX_MEMO_TITLE, isEmptyMemo, isValidMemoColor, type MemoColor } from "@/lib/memo";
import type { Tables, TablesUpdate } from "@/types/database.types";

// DB의 color는 CHECK 제약이 붙은 text라 앱 쪽 유니온으로 좁혀 쓴다
export type Memo = Omit<Tables<"memos">, "user_id" | "color"> & { color: MemoColor };

const SELECT = "id, title, content, color, is_pinned, is_archived, created_at, updated_at";

function toMemo(row: Omit<Tables<"memos">, "user_id">): Memo {
  return { ...row, color: isValidMemoColor(row.color) ? row.color : "default" };
}

async function getClient() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function getMemos(): Promise<{ memos?: Memo[]; error?: string }> {
  const { supabase, user } = await getClient();
  if (!user) return { error: "로그인이 필요합니다." };

  // 정렬·필터는 클라이언트가 담당한다(lib/memo.ts 공용)
  const { data, error } = await supabase.from("memos").select(SELECT).eq("user_id", user.id).order("updated_at", { ascending: false });

  if (error) {
    console.error("[Supabase DB] 메모 조회 실패:", error);
    return { error: "메모를 불러오는 중 오류가 발생했습니다." };
  }
  return { memos: (data ?? []).map(toMemo) };
}

export type NewMemo = { title: string; content: string; color?: MemoColor };

export async function addMemo(input: NewMemo): Promise<{ memo?: Memo; error?: string }> {
  const { supabase, user } = await getClient();
  if (!user) return { error: "로그인이 필요합니다." };

  const title = input.title.trim().slice(0, MAX_MEMO_TITLE);
  const content = input.content.slice(0, MAX_MEMO_CONTENT);
  if (isEmptyMemo(title, content)) return { error: "메모 내용을 입력해 주세요." };

  const { data, error } = await supabase
    .from("memos")
    .insert({ user_id: user.id, title, content, color: isValidMemoColor(input.color) ? input.color : "default" })
    .select(SELECT)
    .single();

  if (error || !data) {
    console.error("[Supabase DB] 메모 추가 실패:", error);
    return { error: "메모를 저장하는 중 오류가 발생했습니다." };
  }
  return { memo: toMemo(data) };
}

export type MemoPatch = { title?: string; content?: string; color?: MemoColor };

export async function updateMemo(id: string, patch: MemoPatch): Promise<{ memo?: Memo; error?: string }> {
  const { supabase, user } = await getClient();
  if (!user) return { error: "로그인이 필요합니다." };

  // updated_at은 트리거가 없으므로 여기서 직접 갱신한다(정렬 기준이라 빠뜨리면 순서가 안 바뀐다)
  const update: TablesUpdate<"memos"> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) update.title = patch.title.trim().slice(0, MAX_MEMO_TITLE);
  if (patch.content !== undefined) update.content = patch.content.slice(0, MAX_MEMO_CONTENT);
  if (patch.color !== undefined && isValidMemoColor(patch.color)) update.color = patch.color;

  const nextTitle = update.title ?? "";
  const nextContent = update.content ?? "";
  if (patch.title !== undefined && patch.content !== undefined && isEmptyMemo(nextTitle, nextContent)) {
    return { error: "메모 내용을 입력해 주세요." };
  }

  const { data, error } = await supabase.from("memos").update(update).eq("id", id).eq("user_id", user.id).select(SELECT).single();

  if (error || !data) {
    console.error("[Supabase DB] 메모 수정 실패:", error);
    return { error: "메모를 수정하는 중 오류가 발생했습니다." };
  }
  return { memo: toMemo(data) };
}

export async function setMemoPinned(id: string, pinned: boolean): Promise<{ error?: string }> {
  const { supabase, user } = await getClient();
  if (!user) return { error: "로그인이 필요합니다." };

  const { error } = await supabase.from("memos").update({ is_pinned: pinned }).eq("id", id).eq("user_id", user.id);
  if (error) {
    console.error("[Supabase DB] 메모 고정 변경 실패:", error);
    return { error: "고정 상태를 바꾸는 중 오류가 발생했습니다." };
  }
  return {};
}

/** 보관하면 고정은 자동으로 해제한다(보관함에 고정 개념이 없다). */
export async function setMemoArchived(id: string, archived: boolean): Promise<{ error?: string }> {
  const { supabase, user } = await getClient();
  if (!user) return { error: "로그인이 필요합니다." };

  const update: TablesUpdate<"memos"> = archived ? { is_archived: true, is_pinned: false } : { is_archived: false };
  const { error } = await supabase.from("memos").update(update).eq("id", id).eq("user_id", user.id);
  if (error) {
    console.error("[Supabase DB] 메모 보관 변경 실패:", error);
    return { error: "보관 상태를 바꾸는 중 오류가 발생했습니다." };
  }
  return {};
}

export async function deleteMemo(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await getClient();
  if (!user) return { error: "로그인이 필요합니다." };

  const { error } = await supabase.from("memos").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    console.error("[Supabase DB] 메모 삭제 실패:", error);
    return { error: "메모를 삭제하는 중 오류가 발생했습니다." };
  }
  return {};
}
