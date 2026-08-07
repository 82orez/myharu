// 문장 번호(등록 순번) — DB 컬럼이 아니라 created_at 오름차순 순위로 만드는 파생값.
// 항상 1..N 연속이라 중간 문장을 삭제하면 뒤 번호가 당겨진다.
// ⚠️ 계산은 이 모듈 하나에서만 — ReviewClient·QuizView가 같은 번호를 보여야 한다.

export type NumberedSentence = { id: string; created_at: string };

/** 등록 순서(created_at 오름차순) 순위 → 1부터. 동시각은 id로 안정 정렬. */
export function buildSentenceNumbers(sentences: readonly NumberedSentence[]): Map<string, number> {
  const ordered = sentences.slice().sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  return new Map(ordered.map((s, i) => [s.id, i + 1]));
}

/** 검색어가 "#12" 형태면 12를 반환, 아니면 null (숫자만 입력한 "12"는 본문 검색으로 남긴다) */
export function parseSentenceNumberQuery(query: string): number | null {
  const m = query.trim().match(/^#\s*(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
