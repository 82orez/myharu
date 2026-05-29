// 태그 정규화: 공백 제거 → 빈 값 제거 → 중복 제거 → 태그당 최대 20자, 최대 10개.
// 문장 입력/편집(서버 액션)과 태그 입력 컴포넌트에서 동일 규칙으로 사용.

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 20;

export function sanitizeTags(input: string[]): string[] {
  const result: string[] = [];

  for (const raw of input ?? []) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim().slice(0, MAX_TAG_LENGTH);
    if (!tag) continue;
    if (result.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
    result.push(tag);
    if (result.length >= MAX_TAGS) break;
  }

  return result;
}
