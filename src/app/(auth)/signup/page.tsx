import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import SignupForm from "@/components/auth/SignupForm";
import AuthLayout from "@/components/auth/AuthLayout";
import { createClient } from "@/utils/supabase/server";

export const metadata: Metadata = {
  title: "회원가입",
  description: "My Haru에 가입하여 매일 영어 한 문장 학습을 시작하세요.",
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
    <AuthLayout>
      <SignupForm />
    </AuthLayout>
  );
}
