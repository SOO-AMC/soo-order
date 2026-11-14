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
