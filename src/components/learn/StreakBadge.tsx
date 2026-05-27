import { Flame } from "lucide-react";

export default function StreakBadge({ streak, className }: { streak: number; className?: string }) {
  if (streak <= 0) return null;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-streak-orange/10 px-3 py-1 text-sm font-medium text-streak-orange ${className ?? ""}`}>
      <Flame size={16} />
      {streak}일 연속
    </span>
  );
}
