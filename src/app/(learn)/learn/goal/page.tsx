import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { fetchGoalProgress } from "@/lib/gamification";
import GoalForm from "@/components/learn/GoalForm";

export const metadata: Metadata = {
  title: "학습 목표 설정",
  robots: { index: false },
};

export default async function GoalPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const goal = await fetchGoalProgress(supabase, user.id);

  return (
    <main className="bg-muted/30 flex min-h-[calc(100vh-200px)] items-center justify-center px-6 py-16">
      <GoalForm initialGoal={goal} />
    </main>
  );
}
