import { Flame } from "lucide-react";

export default function StreakBadge({ streak, className }: { streak: number; className?: string }) {
  if (streak <= 0) return null;

  return (
    <span
      className={`bg-streak-orange/10 text-streak-orange inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${className ?? ""}`}>
      <Flame size={16} />
      {streak}일째 연속 도전 성공
    </span>
  );
}
