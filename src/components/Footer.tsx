import Link from "next/link";

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "My Haru";

export default function Footer() {
  return (
    <footer className="border-border bg-muted/40 hidden border-t px-6 py-10 md:block">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <span className="text-brand text-sm font-bold">{SITE_NAME}</span>
          <p className="text-muted-foreground text-xs">매일 영어 한 문장, 나만의 학습 습관을 만들어 보세요.</p>
        </div>

        <nav className="flex gap-6">
          <Link href="/" className="text-muted-foreground hover:text-foreground text-xs">
            Home
          </Link>
          <Link href="/learn/input" className="text-muted-foreground hover:text-foreground text-xs">
            문장 입력
          </Link>
          <Link href="/learn/review" className="text-muted-foreground hover:text-foreground text-xs">
            학습하기
          </Link>
        </nav>
      </div>

      <div className="border-border text-muted-foreground mx-auto mt-8 max-w-5xl border-t pt-6 text-center text-xs">
        © {new Date().getFullYear()} {SITE_NAME}. All Rights Reserved.
      </div>
    </footer>
  );
}
