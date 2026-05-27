"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[calc(100vh-200px)] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p className="text-5xl font-bold text-destructive">오류</p>
      <h1 className="text-2xl font-bold">오류가 발생했습니다</h1>
      <p className="max-w-md text-muted-foreground">예상치 못한 문제가 발생했습니다. 다시 시도해 주세요.</p>
      <div className="mt-4 flex gap-3">
        <Button onClick={reset} className="bg-brand text-brand-foreground hover:bg-brand/90">
          다시 시도
        </Button>
        <Button nativeButton={false} variant="outline" render={<Link href="/" />}>
          홈으로
        </Button>
      </div>
    </main>
  );
}
