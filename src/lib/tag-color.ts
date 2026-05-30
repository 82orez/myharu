// 태그 이름 기반 결정적 색상 클래스. 같은 태그는 항상 같은 색, 태그마다 다른 색으로 시각 구분.
// 별도 저장 없이 이름 해시로 팔레트에서 선택.

const TAG_COLORS = [
  "bg-rose-100 text-rose-700",
  "bg-orange-100 text-orange-800",
  "bg-amber-100 text-amber-800",
  "bg-lime-100 text-lime-800",
  "bg-emerald-100 text-emerald-700",
  "bg-teal-100 text-teal-700",
  "bg-sky-100 text-sky-700",
  "bg-indigo-100 text-indigo-700",
  "bg-violet-100 text-violet-700",
  "bg-fuchsia-100 text-fuchsia-700",
];

export function tagColorClass(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}
