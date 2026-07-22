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

// 버튼(필터 칩)용 — hover 색까지 같은 계열로. Tailwind가 스캔하도록 클래스 문자열을 그대로 나열한다.
const TAG_CHIP_COLORS = [
  "bg-rose-100 text-rose-700 hover:bg-rose-200 hover:text-rose-800",
  "bg-orange-100 text-orange-800 hover:bg-orange-200 hover:text-orange-900",
  "bg-amber-100 text-amber-800 hover:bg-amber-200 hover:text-amber-900",
  "bg-lime-100 text-lime-800 hover:bg-lime-200 hover:text-lime-900",
  "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 hover:text-emerald-800",
  "bg-teal-100 text-teal-700 hover:bg-teal-200 hover:text-teal-800",
  "bg-sky-100 text-sky-700 hover:bg-sky-200 hover:text-sky-800",
  "bg-indigo-100 text-indigo-700 hover:bg-indigo-200 hover:text-indigo-800",
  "bg-violet-100 text-violet-700 hover:bg-violet-200 hover:text-violet-800",
  "bg-fuchsia-100 text-fuchsia-700 hover:bg-fuchsia-200 hover:text-fuchsia-800",
];

function tagColorIndex(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return h % TAG_COLORS.length;
}

export function tagColorClass(tag: string): string {
  return TAG_COLORS[tagColorIndex(tag)];
}

export function tagChipClass(tag: string): string {
  return TAG_CHIP_COLORS[tagColorIndex(tag)];
}
