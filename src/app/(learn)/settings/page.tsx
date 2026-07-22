import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { fetchUserStats } from "@/lib/gamification";
import SettingsForm from "@/components/SettingsForm";

export const metadata: Metadata = {
  title: "학습 설정",
  robots: { index: false },
};

export default async function GoalPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const stats = await fetchUserStats(supabase, user.id);

  return (
    <main className="bg-muted/30 flex min-h-[calc(100vh-200px)] items-center justify-center px-6 py-16">
      <SettingsForm initialSpeechStrict={stats?.speech_strict ?? false} />
    </main>
  );
}
