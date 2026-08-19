import { ddayDiff, formatDday } from "@/lib/dday";

// Navbar 우측 D-day 배지. props 전용 순수 표시 컴포넌트(GoalProgressCard 선례).
// ⚠️ 색 클래스는 삼항으로 전체 문자열을 나열할 것 — 조합하면 Tailwind가 스캔하지 못한다(tag-color.ts와 같은 이유).
export default function DdayBadge({ label, date }: { label: string; date: string }) {
  const diff = ddayDiff(date);
  const past = diff < 0;

  return (
    <span
      title={`${label ? `${label} · ` : ""}${date}`}
      className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
        past ? "border-accent-orange/30 bg-accent-orange/10 text-accent-orange" : "border-brand/30 bg-brand/10 text-brand"
      }`}>
      {label && <span className="max-w-[72px] truncate font-medium">{label}</span>}
      <span className="tabular-nums">{formatDday(diff)}</span>
    </span>
  );
}
