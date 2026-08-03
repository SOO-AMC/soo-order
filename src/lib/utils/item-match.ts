// 품목명 토큰 기반 유사도 매칭 (가격비교 드롭다운 + 명세서 매칭 공용).

/** 제조사 접두 제거 후 의미 있는 토큰으로 분리 */
export function tokenize(s: string): string[] {
  const stripped = s
    .replace(/^[^()\s]{1,10}\)/, "")
    .toLowerCase();
  return stripped
    .replace(/([가-힣])(\d)/g, "$1 $2")
    .replace(/(\d)([가-힣])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/(\d)(mg|ml|g|l|mcg|iu|%|정|캡슐|앰플|바이알|프리필드|시린지|팩|매)/gi, "$1 $2")
    .split(/[\s/·,_\-()[\]{}]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

// 용량/단위/포장(스펙) 토큰 — 브랜드명과 달리 서로 다른 약끼리도 자주 겹친다(예: "150", "mg", "캡슐").
const UNIT_TOKENS = new Set([
  "mg", "ml", "g", "l", "mcg", "iu", "%",
  "정", "캡슐", "앰플", "바이알", "프리필드", "시린지", "팩", "매",
]);

/** 숫자·단위·포장코드(스펙) 토큰 여부. 나머지는 브랜드/성분(이름) 토큰. */
function isSpecToken(t: string): boolean {
  return /^\d+(\.\d+)?$/.test(t) || /^[a-z%]$/.test(t) || UNIT_TOKENS.has(t);
}

/** a토큰 중 b토큰에 매칭되는 개수 (b가 a를 포함하면 매칭, 1:1) */
function countMatches(aTokens: string[], bTokens: string[]): number {
  let n = 0;
  const usedB = new Set<number>();
  for (const at of aTokens) {
    for (let i = 0; i < bTokens.length; i++) {
      if (usedB.has(i)) continue;
      if (at === bTokens[i] || (at.length >= 2 && bTokens[i].includes(at))) {
        n++;
        usedB.add(i);
        break;
      }
    }
  }
  return n;
}

/**
 * 토큰 기반 유사도 (0~1).
 * 브랜드(이름) 토큰 일치를 지배적(0.8)으로, 용량·단위(스펙) 토큰은 보조(0.2)로 가중한다.
 * 이렇게 안 하면 "알타민 캡슐 150mg"가 용량 "150mg"이 겹친다는 이유로 "리리카캡슐150mg"에
 * 잘못 매칭된다 — 스펙 토큰을 브랜드명과 동급으로 취급하면 안 됨.
 */
export function similarity(aTokens: string[], aNorm: string, bTokens: string[], bNorm: string): number {
  if (aNorm.length === 0 || bNorm.length === 0) return 0;
  if (aNorm === bNorm) return 1;
  if (bNorm.includes(aNorm)) return 0.95;
  if (aNorm.includes(bNorm)) return 0.9;
  if (aTokens.length === 0 || bTokens.length === 0) return 0;

  const aName = aTokens.filter((t) => !isSpecToken(t));
  const bName = bTokens.filter((t) => !isSpecToken(t));
  const aSpec = aTokens.filter(isSpecToken);
  const bSpec = bTokens.filter(isSpecToken);

  // 한쪽이라도 이름 토큰이 없으면(전부 스펙) 기존 방식으로 폴백
  if (aName.length === 0 || bName.length === 0) {
    const matchCount = countMatches(aTokens, bTokens);
    const unionSize = new Set([...aTokens, ...bTokens]).size;
    const jaccard = matchCount / unionSize;
    const coverage = matchCount / aTokens.length;
    return coverage * 0.7 + jaccard * 0.3;
  }

  const nameCoverage = countMatches(aName, bName) / aName.length;
  if (aSpec.length === 0) return nameCoverage; // 용량 정보가 없으면 이름 일치만으로 판단
  const specCoverage = countMatches(aSpec, bSpec) / aSpec.length;
  return nameCoverage * 0.8 + specCoverage * 0.2;
}

/** 두 품목명의 유사도(0~1) 편의 함수 */
export function nameSimilarity(a: string, b: string): number {
  const at = tokenize(a);
  const bt = tokenize(b);
  return similarity(at, at.join(""), bt, bt.join(""));
}

/** 후보 목록에서 query와 가장 유사한 항목 반환 (minScore 미만이면 null) */
export function bestMatch<T>(
  query: string,
  candidates: T[],
  getName: (c: T) => string,
  minScore = 0.5,
): { item: T; score: number } | null {
  const at = tokenize(query);
  const aNorm = at.join("");
  let best: { item: T; score: number } | null = null;
  for (const c of candidates) {
    const bt = tokenize(getName(c));
    const score = similarity(at, aNorm, bt, bt.join(""));
    if (score > (best?.score ?? -1)) best = { item: c, score };
  }
  return best && best.score >= minScore ? best : null;
}
