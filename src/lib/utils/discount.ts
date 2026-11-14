/**
 * 업체 할인율 계산. DB(vendor_products.unit_price)에는 **할인후** 단가가 들어간다.
 * 화면 입력은 항상 **할인전(업체 정가)** 이고, 저장할 때 한 번만 할인율을 곱한다.
 */

/** 할인전 → 할인후 (원 단위 반올림) */
export function applyDiscount(price: number | null, rate: number): number | null {
  if (price == null) return null;
  if (!rate) return price;
  return Math.round(price * (1 - rate / 100));
}

/** 할인후 → 할인전 (원 단위 반올림). 저장값에서 정가를 거꾸로 구할 때 쓴다. */
export function reverseDiscount(price: number | null, rate: number): number | null {
  if (price == null) return null;
  if (!rate || rate >= 100) return price;
  return Math.round(price / (1 - rate / 100));
}

/** 입력칸 글자 → 숫자. 비었거나 숫자가 없으면 null */
export function parsePriceInput(raw: string | null | undefined): number | null {
  const digits = (raw ?? "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * 수정 화면에서 저장할 단가를 정한다.
 * 손대지 않은 칸은 `changed: false` — 저장하지 않아야 값이 흔들리지 않는다.
 * 바꾼 칸만 할인전 입력값에 할인율을 한 번 적용해 저장값(할인후)을 만든다.
 */
export function priceToSave(
  input: string | undefined,
  initial: string | undefined,
  rate: number,
): { changed: false } | { changed: true; price: number | null } {
  const now = (input ?? "").trim();
  const before = (initial ?? "").trim();
  if (now === before) return { changed: false };
  const nowNum = parsePriceInput(now);
  if (nowNum === parsePriceInput(before)) return { changed: false }; // "3,315" ↔ "3315" 같은 표기 차이
  return { changed: true, price: applyDiscount(nowNum, rate) };
}

/**
 * 한 업체·한 품목에 가격이 여러 개 쌓였을 때, 값들 사이의 할인 관계를 풀어 준다.
 * 예: 할인율 15% 에서 3,315 · 2,818 · 2,395 → 2,818 은 "3,315 의 할인후", 2,395 는 "2,818 을 한 번 더 할인한 값".
 * (예전 저장 방식이 정가·할인후·두 번 할인된 값을 따로따로 남겼다)
 * 어느 값이 맞는지 정하지는 않는다 — 관계만 알려 주고, 판단은 명세서 단가와 함께 사람이 한다.
 */
export function discountRelations(prices: (number | null)[], rate: number): Map<number, { of: number }> {
  const out = new Map<number, { of: number }>();
  if (!rate) return out;
  const set = new Set(prices.filter((p): p is number => p != null && p > 0));
  for (const q of set) {
    const d = applyDiscount(q, rate);
    if (d != null && d !== q && set.has(d) && !out.has(d)) out.set(d, { of: q });
  }
  return out;
}
