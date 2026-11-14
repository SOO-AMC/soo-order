/**
 * 단가 이상값 가리기 · 품목 이력 계산 (순수 함수).
 *
 * 명세서를 글자로 읽어 들이다 보면 단가가 한 자리 빠지거나(181,521 → 11,008),
 * 묶음 단가와 낱개 단가가 섞여(590,909 ↔ 1,181,818) 들어온다.
 * 그런 값이 "가장 쌀 때"나 "체감 인상률"에 그대로 들어가면 통계가 틀어지므로,
 * 보통 값에서 크게 벗어난 것은 "확인 필요"로 표시하고 통계에서 뺀다.
 */

/** 보통 값의 절반 미만이거나 2배 초과면 이상값으로 본다 */
const LOW = 0.5;
const HIGH = 2;

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * 각 단가가 이상값인지. 값이 3개 미만이면 판단하지 않는다(전부 false) — 비교할 "보통 값"이 없다.
 */
export function flagOutliers(prices: number[]): boolean[] {
  const valid = prices.filter((p) => Number.isFinite(p) && p > 0);
  if (valid.length < 3) return prices.map(() => false);
  const med = median(valid)!;
  return prices.map((p) => !(Number.isFinite(p) && p > 0) || p < med * LOW || p > med * HIGH);
}

/** 두 기간의 평균 단가가 절반 이하로 떨어졌거나 2배 이상 뛰었다 → 실제 인상보다 입력 오류일 가능성이 크다 */
export function isSuspectChange(a: number | null, b: number | null): boolean {
  if (a == null || b == null || a <= 0 || b <= 0) return false;
  const ratio = b / a;
  return ratio >= HIGH || ratio <= LOW;
}

/** 주문 날짜들의 평균 간격(일). 2건 미만이면 null */
export function averageIntervalDays(isoDates: string[]): number | null {
  const days = [...new Set(isoDates.map((d) => d.slice(0, 10)))].sort();
  if (days.length < 2) return null;
  const first = Date.parse(days[0]);
  const last = Date.parse(days[days.length - 1]);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  return Math.round(((last - first) / 86_400_000 / (days.length - 1)) * 10) / 10;
}

export interface PricePoint {
  /** YYYY-MM-DD */
  date: string | null;
  unitPrice: number;
}

/**
 * 주문한 날의 단가 추정: 그날 또는 그 전의 가장 가까운 명세서 단가.
 * 그 전 기록이 없으면 그 뒤 45일 안의 가장 가까운 단가(주문 → 입고 사이에 처음 명세서가 생긴 경우).
 */
export function priceNear(orderDate: string, points: PricePoint[]): PricePoint | null {
  const day = orderDate.slice(0, 10);
  const dated = points.filter((p): p is PricePoint & { date: string } => !!p.date && p.unitPrice > 0).sort((a, b) => a.date.localeCompare(b.date));
  let before: PricePoint | null = null;
  for (const p of dated) {
    if (p.date <= day) before = p;
    else {
      if (before) return before;
      const gap = (Date.parse(p.date) - Date.parse(day)) / 86_400_000;
      return gap <= 45 ? p : null;
    }
  }
  return before;
}
