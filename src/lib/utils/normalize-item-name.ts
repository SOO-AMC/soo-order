/**
 * 품목명 별칭(alias) 매칭용 정규화.
 * 소문자 변환 + 모든 공백 제거. ("박스루킨 주" === "박스루킨주")
 */
export function normalizeItemName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}
