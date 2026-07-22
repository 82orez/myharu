const CONTRACTIONS: Record<string, string> = {
  "i'm": "i am",
  "you're": "you are",
  "he's": "he is",
  "she's": "she is",
  "it's": "it is",
  "we're": "we are",
  "they're": "they are",
  "don't": "do not",
  "doesn't": "does not",
  "didn't": "did not",
  "can't": "cannot",
  "won't": "will not",
  "wouldn't": "would not",
  "couldn't": "could not",
  "shouldn't": "should not",
  "isn't": "is not",
  "aren't": "are not",
  "wasn't": "was not",
  "weren't": "were not",
  "haven't": "have not",
  "hasn't": "has not",
  "hadn't": "had not",
  "i've": "i have",
  "you've": "you have",
  "we've": "we have",
  "they've": "they have",
  "i'll": "i will",
  "you'll": "you will",
  "he'll": "he will",
  "she'll": "she will",
  "it'll": "it will",
  "we'll": "we will",
  "they'll": "they will",
  "i'd": "i would",
  "you'd": "you would",
  "he'd": "he would",
  "she'd": "she would",
  "we'd": "we would",
  "they'd": "they would",
  "let's": "let us",
  "that's": "that is",
  "there's": "there is",
  "here's": "here is",
  "what's": "what is",
  "who's": "who is",
  "how's": "how is",
};

const CONTRACTION_PATTERN = new RegExp("\\b(" + Object.keys(CONTRACTIONS).join("|").replace(/'/g, "'") + ")\\b", "g");

// 위 목록에 없는 축약형을 접미사 규칙으로 일반 확장(예: everyone'll → everyone will).
// `'s`는 소유격과 구분할 수 없어 여기 넣지 않고 normalizedVariants에서 두 갈래로 처리한다.
const GENERIC_CONTRACTIONS: [RegExp, string][] = [
  [/(\w+)n't\b/g, "$1 not"],
  [/(\w+)'re\b/g, "$1 are"],
  [/(\w+)'ve\b/g, "$1 have"],
  [/(\w+)'ll\b/g, "$1 will"],
  [/(\w+)'d\b/g, "$1 would"],
  [/(\w+)'m\b/g, "$1 am"],
];

const S_CONTRACTION = /(\w+)'s\b/g;

// 구어 변형 철자 → 표준형. 정답·입력 양쪽에 동일하게 적용되므로 거짓 오답만 줄어든다.
const VARIANTS: Record<string, string> = {
  // ok 계열 → 표준 "ok"
  okay: "ok",
  okey: "ok",
  // 구어 긍정/부정
  yeah: "yes",
  yep: "yes",
  yup: "yes",
  nope: "no",
  // 구어 축약 (going to 류)
  gonna: "going to",
  wanna: "want to",
  gotta: "got to",
  gimme: "give me",
  lemme: "let me",
  kinda: "kind of",
  sorta: "sort of",
  // 접속/전치사 변형
  cause: "because",
  cuz: "because",
  til: "until",
  till: "until",
  thru: "through",
};

const VARIANT_PATTERN = new RegExp("\\b(" + Object.keys(VARIANTS).join("|") + ")\\b", "g");

// expandS=true면 `X's`를 `X is`로도 편다(소유격일 수 있으므로 기본은 끔).
export function normalizeText(text: string, expandS: boolean = false): string {
  let s = text.replace(/[‘’′]/g, "'").toLowerCase();
  s = s.replace(CONTRACTION_PATTERN, (match) => CONTRACTIONS[match] ?? match);
  for (const [pattern, replacement] of GENERIC_CONTRACTIONS) s = s.replace(pattern, replacement);
  if (expandS) s = s.replace(S_CONTRACTION, "$1 is");
  return s
    .replace(VARIANT_PATTERN, (match) => VARIANTS[match] ?? match)
    .replace(/[^\w\s]|_/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// `'s` 해석이 갈리는 문장은 두 가지(그대로 / is로 확장) 정규화형을 모두 후보로 둔다.
function normalizedVariants(text: string): string[] {
  const plain = normalizeText(text);
  const expanded = normalizeText(text, true);
  return plain === expanded ? [plain] : [plain, expanded];
}

function wordLcsLength(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    let prev = 0;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

export const SIMILARITY_THRESHOLD = 0.8;
export const STRICT_SIMILARITY_THRESHOLD = 0.9;

export function textsMatch(a: string, b: string, threshold: number = SIMILARITY_THRESHOLD): { match: boolean; similarity: number } {
  let similarity = 0;

  // `'s` 해석 조합(최대 2×2) 중 가장 잘 맞는 쪽을 채택
  for (const variantA of normalizedVariants(a)) {
    for (const variantB of normalizedVariants(b)) {
      const wordsA = variantA.split(" ").filter(Boolean);
      const wordsB = variantB.split(" ").filter(Boolean);
      const maxLen = Math.max(wordsA.length, wordsB.length);
      if (maxLen === 0) return { match: true, similarity: 1 };
      similarity = Math.max(similarity, wordLcsLength(wordsA, wordsB) / maxLen);
    }
  }

  return { match: similarity >= threshold, similarity };
}
