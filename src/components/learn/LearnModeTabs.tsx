"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, List } from "lucide-react";

const tabs = [
  { href: "/learn/review", label: "문장 목록", Icon: List },
  { href: "/learn/quiz", label: "퀴즈", Icon: BookOpen },
] as const;

export default function LearnModeTabs() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 rounded-xl bg-muted/60 p-1">
      {tabs.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon size={16} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
