"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, X, PenLine, BookOpen, List, LogOut, Repeat, Settings } from "lucide-react";
import { logout } from "@/app/(auth)/logout/actions";
import { createClient } from "@/utils/supabase/client";

type NavbarUser = { email?: string | null } | null;

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "My Haru";

export default function Navbar({ user: initialUser }: { user: NavbarUser }) {
  const [user, setUser] = useState<NavbarUser>(initialUser);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const prevMenuOpen = useRef(false);

  const closeMenu = () => setMenuOpen(false);
  const toggleMenu = () => setMenuOpen((prev) => !prev);

  // SSR로 받은 user prop이 갱신되면(로그인 후 revalidatePath로 layout 재실행) state 동기화.
  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  // 다른 탭에서의 로그인/로그아웃, 토큰 갱신, bfcache 복원 등 SSR 재실행 없이 발생하는
  // auth 상태 변화에 반응. layout-only revalidate가 닿지 않는 케이스를 보완.
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { email: session.user.email } : null);
    });

    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      supabase.auth.getUser().then(({ data }) => {
        setUser(data.user ? { email: data.user.email } : null);
      });
    };
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen && !prevMenuOpen.current) {
      closeButtonRef.current?.focus();
    } else if (!menuOpen && prevMenuOpen.current) {
      triggerRef.current?.focus();
    }
    prevMenuOpen.current = menuOpen;
  }, [menuOpen]);

  return (
    <>
      {/* 상단 네비 */}
      <nav className="border-border bg-background/80 sticky top-0 z-[100] flex items-center border-b px-6 py-4 backdrop-blur-sm">
        <div className="flex flex-1 items-center justify-start">
          <Link href="/" className="text-brand text-xl font-bold">
            {SITE_NAME}
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-end gap-3">
          {/* 데스크톱 인라인 학습 + 인증 영역 */}
          <div className="hidden items-center gap-3 md:flex">
            {user ? (
              <>
                <span className="text-muted-foreground max-w-[180px] truncate text-sm" title={user.email ?? undefined}>
                  {user.email}
                </span>
                <form action={logout}>
                  <button
                    type="submit"
                    className="border-border text-foreground hover:border-foreground focus-visible:ring-ring/50 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                    로그아웃
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-foreground hover:text-primary focus-visible:ring-ring/50 rounded text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                  로그인
                </Link>
                <Link
                  href="/signup"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring/50 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                  회원가입
                </Link>
              </>
            )}
          </div>

          {/* 사이드바 트리거 — 로그인 시 모바일에서는 하단 탭 바로 대체되므로 숨김 */}
          <button
            ref={triggerRef}
            type="button"
            onClick={toggleMenu}
            aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={menuOpen}
            aria-controls="side-menu"
            className="bg-brand text-brand-foreground focus-visible:ring-ring/50 flex h-10 w-10 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
            <Menu size={20} />
          </button>
        </div>
      </nav>

      {/* 사이드바 배경 오버레이 */}
      <div
        aria-hidden="true"
        onClick={closeMenu}
        className={`fixed inset-0 z-[150] bg-black/40 transition-opacity duration-300 ${
          menuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* 우측 슬라이드 사이드바 */}
      <div
        id="side-menu"
        role="dialog"
        aria-modal="true"
        aria-label="사이드 메뉴"
        aria-hidden={!menuOpen}
        inert={!menuOpen}
        className={`border-border bg-background fixed top-0 z-[200] h-screen w-[280px] border-l pt-8 transition-[right] duration-300 ease-in-out ${
          menuOpen ? "right-0" : "-right-[300px]"
        }`}>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={closeMenu}
          aria-label="메뉴 닫기"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute top-4 right-6 rounded border-none bg-transparent transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
          <X size={24} />
        </button>
        <ul className="list-none px-6">
          {user && (
            <>
              <li className="border-border border-b py-4">
                <Link href="/learn/input" onClick={closeMenu} className="text-foreground flex items-center gap-3 text-[15px] font-medium">
                  <PenLine size={18} className="text-brand" />
                  문장 입력
                </Link>
              </li>
              <li className="border-border border-b py-4">
                <Link href="/learn/review" onClick={closeMenu} className="text-foreground flex items-center gap-3 text-[15px] font-medium">
                  <List size={18} className="text-brand" />
                  연습하기
                </Link>
              </li>
              <li className="border-border border-b py-4">
                <Link href="/learn/quiz" onClick={closeMenu} className="text-foreground flex items-center gap-3 text-[15px] font-medium">
                  <BookOpen size={18} className="text-brand" />
                  퀴즈 풀기
                </Link>
              </li>
              <li className="border-border border-b py-4">
                <Link href="/learn/player" onClick={closeMenu} className="text-foreground flex items-center gap-3 text-[15px] font-medium">
                  <Repeat size={18} className="text-brand" />
                  Repeater
                </Link>
              </li>
              <li className="border-border border-b py-4">
                <Link href="/settings" onClick={closeMenu} className="text-foreground flex items-center gap-3 text-[15px] font-medium">
                  <Settings size={18} className="text-brand" />
                  설정
                </Link>
              </li>
            </>
          )}

          {user ? (
            <>
              <li className="border-border border-b py-4">
                <span className="text-muted-foreground block truncate text-[13px]" title={user.email ?? undefined}>
                  {user.email}
                </span>
              </li>
              <li className="py-4">
                <form action={logout}>
                  <button
                    type="submit"
                    className="border-border text-foreground hover:border-foreground focus-visible:ring-ring/50 flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-[15px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                    <LogOut size={16} />
                    로그아웃
                  </button>
                </form>
              </li>
            </>
          ) : (
            <>
              <li className="border-border border-b py-4">
                <Link
                  href="/login"
                  onClick={closeMenu}
                  className="text-foreground focus-visible:ring-ring/50 rounded text-[15px] font-medium no-underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                  로그인
                </Link>
              </li>
              <li className="py-4">
                <Link
                  href="/signup"
                  onClick={closeMenu}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring/50 block w-full rounded-md px-4 py-2.5 text-center text-[15px] font-semibold no-underline transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                  회원가입
                </Link>
              </li>
            </>
          )}
        </ul>
      </div>
    </>
  );
}
