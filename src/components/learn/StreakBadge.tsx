import { Flame } from "lucide-react";

export default function StreakBadge({ count, achievedToday, className }: { count: number; achievedToday: boolean; className?: string }) {
  if (count <= 0) return null;

  return (
    <span
      className={`bg-streak-orange/10 text-streak-orange inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${className ?? ""}`}>
      <Flame size={16} />
      {achievedToday ? `${count}일째 연속 목표 달성 성공!` : `${count}일째 목표 달성에 도전 중~`}
    </span>
  );
}
