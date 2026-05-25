import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import SignupForm from "@/components/auth/SignupForm";
import { createClient } from "@/utils/supabase/server";

export const metadata: Metadata = {
  title: "회원가입",
};

export default async function SignupPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  return (
    <main className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-muted/30 px-6 py-16">
      <SignupForm />
    </main>
  );
}
