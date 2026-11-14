/** 약품 한눈에 보기 화면용 타입 */

export interface ItemPricePoint {
  /** 명세서 거래일 (YYYY-MM-DD) */
  date: string | null;
  vendor: string;
  /** 할인후 단가 */
  unitPrice: number;
  quantity: number;
  /** 보통 값에서 크게 벗어난 단가 — 입력 오류일 수 있어 통계에서 뺀다 */
  outlier: boolean;
}

export interface ItemOrderRow {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  status: string;
  vendor: string;
  requester: string;
  createdAt: string;
  /** 그때 단가 */
  price: number | null;
  /** invoice = 이 주문을 검수한 명세서의 단가, estimate = 가까운 날짜의 명세서 단가 */
  priceBasis: "invoice" | "estimate" | null;
  priceDate: string | null;
}

export interface ItemOverview {
  /** false 면 supabase/migrate-item-history.sql 을 아직 실행하지 않은 것 (주문 이력이 비어 보인다) */
  ready: boolean;
  title: string;
  product: { id: string; name: string; notes: string } | null;
  /** 지금 가격 비교표의 업체별 단가 (싼 순) */
  currentPrices: { vendor: string; price: number; main: boolean }[];
  trend: ItemPricePoint[];
  orders: ItemOrderRow[];
  /** 이 품목으로 묶인 주문에 실제로 적힌 이름들 */
  names: { name: string; n: number }[];
  stats: {
    orderCount: number;
    totalQuantity: number;
    firstOrderAt: string | null;
    lastOrderAt: string | null;
    avgIntervalDays: number | null;
    lastPrice: number | null;
    /** 처음 → 최근 단가 변화율 (%) */
    changePct: number | null;
    minPrice: number | null;
    maxPrice: number | null;
    outlierCount: number;
  } | null;
}
