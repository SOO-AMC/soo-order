/**
 * 품목명 별칭(alias) 매칭용 정규화.
 * 소문자 변환 + 모든 공백 제거. ("박스루킨 주" === "박스루킨주")
 */
export function normalizeItemName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

/**
 * 중복 주문 감지용 느슨한 이름 매칭.
 * 정규화 후 완전 일치, 또는 (양쪽 3자 이상일 때) 한쪽이 다른 쪽을 포함하면 같은 품목으로 본다.
 */
export function itemNamesLooselyMatch(a: string, b: string): boolean {
  const na = normalizeItemName(a);
  const nb = normalizeItemName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 3 && nb.length >= 3 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}
