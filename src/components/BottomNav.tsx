"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PenLine, BookOpen, User } from "lucide-react";

type BottomNavUser = { email?: string | null } | null;

const tabs = [
  { href: "/", icon: Home, label: "홈" },
  { href: "/learn/input", icon: PenLine, label: "입력" },
  { href: "/learn/review", icon: BookOpen, label: "학습" },
  { href: "/", icon: User, label: "프로필" },
];

export default function BottomNav({ user }: { user: BottomNavUser }) {
  const pathname = usePathname();

  if (!user) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[100] border-t border-border bg-background/95 backdrop-blur-sm md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex h-16 items-center justify-around">
        {tabs.map((tab) => {
          const isActive = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link key={tab.label} href={tab.href} className={`flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 transition-colors ${isActive ? "bg-brand/10 text-brand" : "text-muted-foreground"}`}>
              <tab.icon size={20} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
