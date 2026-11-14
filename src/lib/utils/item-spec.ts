/**
 * 품목 이름에서 용량·포장을 읽어, 두 이름이 "이름은 비슷하지만 다른 물건"인지 가린다.
 *
 * 이름 유사도(item-match.ts)만 쓰면 "가바펜틴캡슐100mg" 과 "가바펜틴캡슐300mg" 이 0.9점 넘게 나와
 * 같은 품목으로 묶인다. 그러면 명세서 확정 때 100mg 의 단가가 300mg 품목에 덮어써진다.
 * 그래서 자동으로 묶기 전에 여기서 용량(mg·ml·% 등)과 포장(10V·100T 등)이 서로 다른지 본다.
 *
 * 한쪽에만 적혀 있으면 다르다고 보지 않는다 — 직원은 흔히 "메로페넴 주" 처럼 용량 없이 적는다.
 */

import { bestMatch } from "./item-match";

export interface ItemSpecs {
  /** 용량: 종류(mass·volume·iu·pct) → 값들. 질량은 mg, 부피는 ml 로 맞춘다 */
  dose: Map<string, number[]>;
  /** 포장: 단위(t·c·v·a·ea·p 등) → 값들 */
  pack: Map<string, number[]>;
}

const DOSE: Record<string, [kind: string, factor: number]> = {
  mcg: ["mass", 0.001],
  ug: ["mass", 0.001],
  mg: ["mass", 1],
  g: ["mass", 1000],
  kg: ["mass", 1_000_000],
  ml: ["volume", 1],
  cc: ["volume", 1],
  l: ["volume", 1000],
  iu: ["iu", 1],
  "%": ["pct", 1],
};

const PACK: Record<string, string> = {
  t: "t", 정: "t",
  c: "c", 캡슐: "c",
  v: "v", 바이알: "v",
  a: "a", 앰플: "a",
  ea: "ea", 개: "ea",
  p: "p", 포: "p",
  매: "매",
  관: "관",
  병: "병",
};

// 긴 단위를 먼저 (mcg 가 mg·g 보다, ml 이 l 보다, ea 가 a 보다 먼저 잡히도록)
const SPEC_RE = /(\d+(?:\.\d+)?)\s*(mcg|ug|mg|kg|ml|cc|iu|ea|캡슐|바이알|앰플|g|l|%|t|c|v|a|p|정|개|포|매|관|병)(?![a-z])/g;

const cache = new Map<string, ItemSpecs>();

export function specsOf(name: string): ItemSpecs {
  const hit = cache.get(name);
  if (hit) return hit;

  const dose = new Map<string, number[]>();
  const pack = new Map<string, number[]>();
  const text = name
    .normalize("NFKC") // ㎎ → mg, 전각 숫자 → 숫자
    .toLowerCase()
    .replace(/(\d),(?=\d{3})/g, "$1"); // 1,000T → 1000T

  for (const m of text.matchAll(SPEC_RE)) {
    const value = parseFloat(m[1]);
    const unit = m[2];
    if (!Number.isFinite(value)) continue;
    const d = DOSE[unit];
    if (d) {
      const v = Math.round(value * d[1] * 1e6) / 1e6;
      dose.set(d[0], [...(dose.get(d[0]) ?? []), v]);
      continue;
    }
    const p = PACK[unit];
    if (p) pack.set(p, [...(pack.get(p) ?? []), value]);
  }

  const specs = { dose, pack };
  if (cache.size > 20000) cache.clear();
  cache.set(name, specs);
  return specs;
}

/** 같은 종류의 값이 양쪽에 다 적혀 있는데 겹치는 값이 하나도 없으면 "다르다" */
function differs(a: Map<string, number[]>, b: Map<string, number[]>): boolean {
  for (const [kind, av] of a) {
    const bv = b.get(kind);
    if (!bv || bv.length === 0) continue;
    if (!av.some((x) => bv.some((y) => Math.abs(x - y) < 1e-6))) return true;
  }
  return false;
}

/** 용량이 서로 다르다 (예: 100mg ↔ 300mg, 5ml ↔ 10ml). 한쪽에만 적혀 있으면 false */
export function doseConflict(a: string, b: string): boolean {
  return differs(specsOf(a).dose, specsOf(b).dose);
}

/** 포장 수량이 서로 다르다 (예: 10V ↔ 1V, 100T ↔ 500T). 한쪽에만 적혀 있으면 false */
export function packConflict(a: string, b: string): boolean {
  return differs(specsOf(a).pack, specsOf(b).pack);
}

/**
 * 이름이 가장 비슷한 후보를 고르되, 용량이 다른 후보는 처음부터 뺀다.
 * `pack: true` 면 포장 수량이 다른 후보도 뺀다 — 단가를 비교·갱신할 때 쓴다(10V 와 1V 는 값이 다르다).
 */
export function bestMatchSameSpec<T>(
  query: string,
  candidates: T[],
  getName: (c: T) => string,
  minScore = 0.5,
  opts: { pack?: boolean } = {},
): { item: T; score: number } | null {
  const safe = candidates.filter((c) => {
    const name = getName(c);
    return !doseConflict(query, name) && !(opts.pack && packConflict(query, name));
  });
  return bestMatch(query, safe, getName, minScore);
}
