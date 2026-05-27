import { Star } from "lucide-react";

export default function XpBadge({ xp, className }: { xp: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-xp-gold/10 px-3 py-1 text-sm font-medium text-xp-gold ${className ?? ""}`}>
      <Star size={16} />
      {xp.toLocaleString()} XP
    </span>
  );
}
