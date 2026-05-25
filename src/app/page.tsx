import Link from "next/link";
import { cookies } from "next/headers";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/server";

export default async function Home() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-[calc(100vh-200px)] max-w-3xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <h1 className="text-4xl font-bold tracking-tight">My Haru</h1>
      <p className="text-muted-foreground max-w-prose">
        나의 하루를 기록하고 관리하는 개인 서비스입니다.
      </p>

      {user ? (
        <p className="border-border bg-muted/40 rounded-md border px-4 py-2 text-sm">
          현재 <span className="font-semibold">{user.email}</span> 로 로그인되어 있습니다.
        </p>
      ) : (
        <div className="flex gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Button nativeButton={false} render={<Link href="/login" />} className="h-10 w-full px-5">
              로그인
            </Button>
            <Button nativeButton={false} variant="outline" render={<Link href="/signup" />} className="h-10 w-full px-5">
              회원가입
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
