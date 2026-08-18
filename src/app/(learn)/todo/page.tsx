import type { Metadata } from "next";
import { getTodos } from "@/app/(learn)/todo/actions";
import TodoClient from "@/components/todo/TodoClient";

export const metadata: Metadata = {
  title: "할 일",
  robots: { index: false },
};

// 로그인 가드는 (learn) 그룹 레이아웃이 담당한다 — 여기서 다시 검사하지 않는다.
export default async function TodoPage() {
  const { todos, error } = await getTodos();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">할 일</h1>
      <TodoClient initialTodos={todos ?? []} initialError={error} />
    </main>
  );
}
