/** 약품 정리함(주문에 적힌 이름 → 표준 품목)용 타입 */

export interface StandardProductLite {
  id: string;
  name: string;
  /** 구분 (약품·약국 등) */
  notes: string;
}

/** 주문에 적혀 있지만 표준 품목과 연결되지 않은 이름 */
export interface UnlinkedItemName {
  /** 이름 열쇠 (소문자 + 공백 제거). 같은 열쇠의 주문은 한 이름으로 본다 */
  key: string;
  /** 그 열쇠로 가장 최근에 적힌 글자 */
  name: string;
  count: number;
  lastAt: string | null;
  /** 연결 제안. 없으면 직접 골라야 한다 */
  proposal: StandardProductLite | null;
  /**
   * 제안의 근거
   * - invoice: 이 이름의 주문이 명세서로 검수될 때 그 품목으로 확인됨 (강한 근거)
   * - guess: 이름이 비슷함 (용량이 다른 품목은 제안하지 않는다)
   */
  basis: "invoice" | "guess" | null;
  /** 명세서로 확인된 주문 수 */
  invoiceCount: number;
  /** 한 번에 연결해도 되는가 (명세서 근거가 있고 이름 추측과도 어긋나지 않음) */
  strong: boolean;
}

export interface ItemCleanup {
  /** false 면 supabase/migrate-product-link.sql 을 아직 실행하지 않은 것 */
  ready: boolean;
  totalNames: number;
  totalOrders: number;
  linkedNames: number;
  linkedOrders: number;
  unlinkedNames: number;
  unlinkedOrders: number;
  /** "약품 아님"으로 숨긴 이름 (정리함 목록에서 빠진다) */
  hiddenNames: number;
  hiddenOrders: number;
  items: UnlinkedItemName[];
}

/** 정리함에서 숨긴 이름 */
export interface HiddenItemName {
  key: string;
  name: string;
}

export type LinkVendorProductResult =
  | { status: "linked"; invoiceLines: number }
  | { status: "conflict"; existingPrice: number | null; newPrice: number | null };

export type ProductLinkResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
