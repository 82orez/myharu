// 문장 목록·퀴즈가 공유하는 필터/정렬 로직. 디렉티브 없는 순수 모듈(클라 컴포넌트 양쪽에서 import).
// ⚠️ 필터 판정을 여기 말고 다른 곳에서 다시 구현하지 말 것 — 학습 모드와 퀴즈가 같은 조건에 같은 결과를 줘야 한다.

import { parseSentenceNumberQuery } from "@/lib/sentence-number";

// 필터가 보는 최소 형태 — Sentence 타입에 의존하지 않는다(구조 타입)
export type FilterableSentence = {
  id: string;
  created_at: string;
  is_favorite: boolean;
  tags: string[];
  english_text: string;
  korean_text: string;
  speech_count: number;
  text_count: number;
  listen_count: number;
};

/** created_at(ISO) → KST 날짜 문자열(YYYY-MM-DD) */
export const kstDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

/** 문장의 총 연습 횟수(스피킹 정답 + 쓰기 정답 + 듣기 재생). 0이면 "미연습" */
export const practiceTotal = (s: Pick<FilterableSentence, "speech_count" | "text_count" | "listen_count">) =>
  s.speech_count + s.text_count + s.listen_count;

// 입력일(KST) 기간 프리셋. days는 오늘을 포함한 일수, all은 제한 없음
export const DAY_RANGES = [
  { value: "all", label: "전체 일자", days: 0 },
  { value: "today", label: "오늘", days: 1 },
  { value: "3d", label: "최근 3일", days: 3 },
  { value: "7d", label: "최근 일주일", days: 7 },
  { value: "30d", label: "최근 한달", days: 30 },
] as const;

export type DayRange = (typeof DAY_RANGES)[number]["value"];

/** 프리셋의 시작 경계 날짜(YYYY-MM-DD). all이면 null */
export function rangeCutoff(range: DayRange): string | null {
  const days = DAY_RANGES.find((r) => r.value === range)?.days ?? 0;
  if (days <= 0) return null;
  return kstDate(new Date(Date.now() - (days - 1) * 86400000).toISOString());
}

export type SentenceFilter = {
  dayRange: DayRange;
  favoriteOnly: boolean;
  tags: string[];
  // 태그 다중 선택 결합 방식: and = 모두 포함, or = 하나라도 포함
  tagMode: "and" | "or";
  // 태그가 하나도 없는 문장만 (태그 선택과 상호 배타)
  noTagOnly: boolean;
  // 본문(영어·한국어) 검색. "#12"처럼 #+숫자만이면 문장 번호 정확 일치
  search: string;
  // 순번 범위 입력 결과(퀴즈 전용). null = 제한 없음
  numbers: Set<number> | null;
  // 연습 0회인 문장만(퀴즈 전용)
  unpracticedOnly: boolean;
};

export const EMPTY_FILTER: SentenceFilter = {
  dayRange: "all",
  favoriteOnly: false,
  tags: [],
  tagMode: "and",
  noTagOnly: false,
  search: "",
  numbers: null,
  unpracticedOnly: false,
};

/** 필터 결합(모두 AND): 입력일 → 즐겨찾기 → 미연습 → 순번 → 태그 → 검색 */
export function filterSentences<T extends FilterableSentence>(list: T[], f: SentenceFilter, numbers: Map<string, number>): T[] {
  const cutoff = rangeCutoff(f.dayRange);
  const q = f.search.trim().toLowerCase();
  const numQuery = parseSentenceNumberQuery(f.search);

  return list.filter((s) => {
    if (cutoff && kstDate(s.created_at) < cutoff) return false;
    if (f.favoriteOnly && !s.is_favorite) return false;
    if (f.unpracticedOnly && practiceTotal(s) > 0) return false;
    if (f.numbers && !f.numbers.has(numbers.get(s.id) ?? -1)) return false;

    if (f.noTagOnly) {
      if (s.tags.length > 0) return false;
    } else if (f.tags.length > 0) {
      const hit = f.tagMode === "or" ? f.tags.some((t) => s.tags.includes(t)) : f.tags.every((t) => s.tags.includes(t));
      if (!hit) return false;
    }

    if (numQuery !== null) {
      if (numbers.get(s.id) !== numQuery) return false;
    } else if (q && !`${s.english_text} ${s.korean_text}`.toLowerCase().includes(q)) return false;

    return true;
  });
}

/**
 * "1-20, 35, 40-45" → Set<number>. 공백/줄바꿈도 구분자로 허용.
 * 빈 입력이면 numbers=null(제한 없음), 형식이 틀리면 invalid=true(파싱된 부분은 버린다).
 */
export function parseNumberRanges(input: string): { numbers: Set<number> | null; invalid: boolean } {
  const trimmed = input.trim();
  if (!trimmed) return { numbers: null, invalid: false };

  const out = new Set<number>();
  for (const part of trimmed.split(/[,\s]+/).filter(Boolean)) {
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      // 역순 구간(20-1)은 오타로 보고 거른다
      if (!from || !to || from > to) return { numbers: null, invalid: true };
      for (let n = from; n <= to; n++) out.add(n);
      continue;
    }
    const single = part.match(/^#?(\d+)$/);
    if (!single || !Number(single[1])) return { numbers: null, invalid: true };
    out.add(Number(single[1]));
  }

  return { numbers: out.size > 0 ? out : null, invalid: false };
}

/** 퀴즈 출제 순서. "random"은 호출 시점에 셔플하므로 세션 시작에서 한 번만 부를 것 */
export type QuizOrder = "number" | "latest" | "random" | "practice-asc";

export const QUIZ_ORDERS: { value: QuizOrder; label: string }[] = [
  { value: "number", label: "번호순 (#1부터)" },
  { value: "latest", label: "최신순" },
  { value: "random", label: "무작위" },
  { value: "practice-asc", label: "연습 적은순" },
];

export function orderSentences<T extends FilterableSentence>(list: T[], order: QuizOrder, numbers: Map<string, number>): T[] {
  const out = list.slice();
  const byNumber = (a: T, b: T) => (numbers.get(a.id) ?? 0) - (numbers.get(b.id) ?? 0);

  if (order === "random") {
    // Fisher–Yates
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  if (order === "latest") return out.sort((a, b) => byNumber(b, a));
  if (order === "practice-asc") return out.sort((a, b) => practiceTotal(a) - practiceTotal(b) || byNumber(a, b));
  return out.sort(byNumber);
}
