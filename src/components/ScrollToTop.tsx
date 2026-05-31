"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// 라우트(pathname) 변경 시 문서 최상단으로 스크롤 (브라우저 자동 복원 누락 보완)
export default function ScrollToTop() {
  const pathname = usePathname();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
