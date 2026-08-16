const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "My Haru";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-[calc(100vh-200px)]">
      {/* 데스크탑 브랜드 패널 */}
      <div className="from-brand via-brand/80 to-brand/60 hidden w-[45%] items-center justify-center bg-gradient-to-br md:flex">
        <div className="text-brand-foreground px-12 text-center">
          <h1 className="text-4xl font-bold">{SITE_NAME}</h1>
          <p className="mt-4 text-lg opacity-90">매일 영어 한 문장,</p>
          <p className="text-lg opacity-90">나만의 학습 습관을 만들어 보세요.</p>
        </div>
      </div>

      {/* 폼 영역 */}
      <div className="bg-muted/30 flex flex-1 items-center justify-center px-6 py-16">{children}</div>
    </main>
  );
}
