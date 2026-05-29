import Link from "next/link";

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "My Haru";

export default function Footer() {
  return (
    <footer className="hidden border-t border-border bg-muted/40 px-6 py-10 md:block">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold text-brand">{SITE_NAME}</span>
          <p className="text-xs text-muted-foreground">매일 영어 한 문장, 나만의 학습 습관을 만들어 보세요.</p>
        </div>

        <nav className="flex gap-6">
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
            홈
          </Link>
          <Link href="/learn/input" className="text-xs text-muted-foreground hover:text-foreground">
            문장 입력
          </Link>
          <Link href="/learn/review" className="text-xs text-muted-foreground hover:text-foreground">
            학습하기
          </Link>
        </nav>
      </div>

      <div className="mx-auto mt-8 max-w-5xl border-t border-border pt-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {SITE_NAME}. All Rights Reserved.
      </div>
    </footer>
  );
}
