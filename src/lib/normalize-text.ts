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

export function normalizeText(text: string): string {
  return text
    .replace(/[‘’′]/g, "'")
    .toLowerCase()
    .replace(CONTRACTION_PATTERN, (match) => CONTRACTIONS[match] ?? match)
    .replace(VARIANT_PATTERN, (match) => VARIANTS[match] ?? match)
    .replace(/[^\w\s]|_/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

const SIMILARITY_THRESHOLD = 0.8;

export function textsMatch(a: string, b: string): { match: boolean; similarity: number } {
  const wordsA = normalizeText(a).split(" ").filter(Boolean);
  const wordsB = normalizeText(b).split(" ").filter(Boolean);
  if (wordsA.length === 0 && wordsB.length === 0) return { match: true, similarity: 1 };
  const maxLen = Math.max(wordsA.length, wordsB.length);
  if (maxLen === 0) return { match: true, similarity: 1 };
  const lcs = wordLcsLength(wordsA, wordsB);
  const similarity = lcs / maxLen;
  return { match: similarity >= SIMILARITY_THRESHOLD, similarity };
}
