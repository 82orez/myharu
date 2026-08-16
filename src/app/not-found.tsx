import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-[calc(100vh-200px)] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p className="text-brand text-7xl font-bold">404</p>
      <h1 className="text-2xl font-bold">페이지를 찾을 수 없습니다</h1>
      <p className="text-muted-foreground max-w-md">요청하신 페이지가 존재하지 않거나 이동되었습니다.</p>
      <Button nativeButton={false} render={<Link href="/" />} className="bg-brand text-brand-foreground hover:bg-brand/90 mt-4">
        홈으로 돌아가기
      </Button>
    </main>
  );
}
