// 거래명세서 OCR / 거래처원장 타입

/** Claude Vision OCR이 명세서에서 추출한 라인 */
export interface ExtractedItem {
  name: string;
  quantity: number;
  /** 할인전 정가(명세서에 적힌 단가) */
  listPrice: number;
  /** 그 줄에 인쇄된 금액 (읽은 그대로 — 계산한 값이 아니다). 칸이 없거나 못 읽으면 0. 확정 전 검사에 쓴다 */
  amount?: number;
}

/** Claude Vision OCR 추출 결과 */
export interface ExtractedInvoice {
  vendorName: string;
  invoiceDate: string;
  items: ExtractedItem[];
  /** 명세서에 인쇄된 합계(공급가액 합계). 못 읽으면 0. 줄 합계와 맞는지 검사하는 데 쓴다 */
  totalAmount?: number;
  /** 합본 PDF에서 이 명세서가 차지하는 페이지(1부터). 묶음(multi) 추출 시만 채워짐 */
  pageStart?: number;
  pageEnd?: number;
}

/** invoices 테이블 행 */
export interface Invoice {
  id: string;
  vendor_id: string | null;
  vendor_name: string;
  invoice_date: string | null;
  image_urls: string[];
  total_amount: number;
  created_by: string | null;
  created_at: string;
}

/** 미매칭/잔여 수량에 대한 관리자 결정 */
export type UnmatchedAction = "ledger" | "return" | "inspect";
// ledger: 원장에만 기록 / return: 반품 등록 / inspect: 검수완료 직접 등록

/** 명세서 라인 수량을 특정 검수대기 주문에 배분 */
export interface ConfirmAllocation {
  orderId: string;
  quantity: number;
}

/** confirmInvoice 가 받는 라인 단위 결정 */
export interface ConfirmRowInput {
  itemName: string;
  quantity: number;
  listPrice: number;
  unitPrice: number; // 할인후 환산 단가
  amount: number;
  /** 검수대기 주문별 배분 (한 라인 → 여러 주문 분할 가능) */
  allocations: ConfirmAllocation[];
  /** 배분되지 않은 잔여 수량 처리 (잔여 0이면 null) */
  leftoverAction: UnmatchedAction | null;
  unifiedProductId: string | null;
  vendorProductId: string | null;
  updatePrice: boolean; // 단가 불일치 → 갱신 여부
  isNewProduct: boolean;
}

/** confirmInvoice 페이로드 */
export interface ConfirmInvoicePayload {
  vendorId: string | null;
  vendorName: string;
  invoiceDate: string | null;
  imagePath: string;
  /** 합본 PDF에서 이 명세서가 차지하는 페이지 범위 (1-indexed, inclusive). 단일 모드면 생략. */
  pageStart?: number;
  pageEnd?: number;
  rows: ConfirmRowInput[];
  /** 같은 업체·날짜·금액의 명세서가 이미 있어도 확정한다 (사용자가 확인한 뒤에만 true) */
  allowDuplicate?: boolean;
}

/** confirmInvoice 결과. 서버 오류 문구는 배포판에서 가려지므로 던지지 않고 값으로 돌려준다 */
export type ConfirmInvoiceResult =
  | { ok: true }
  | { ok: false; code: "duplicate" | "error"; message: string };

/** invoice_items 테이블 행 */
export interface InvoiceItem {
  id: string;
  invoice_id: string;
  item_name: string;
  quantity: number;
  list_price: number;
  unit_price: number;
  amount: number;
  matched_order_id: string | null;
  unified_product_id: string | null;
  is_new_product: boolean;
  created_at: string;
}

/** 거래처원장 조회 행 (invoice_items + invoices 조인) */
export interface LedgerRow {
  invoiceId: string;
  invoiceDate: string | null;
  vendorName: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

/** 거래처원장 — 명세서 원본 문서 1건 */
export interface InvoiceDoc {
  id: string;
  vendorName: string;
  invoiceDate: string | null;
  totalAmount: number;
  itemCount: number;
  imagePaths: string[]; // Storage(invoices 버킷) 경로
}

/** 단가 분석 — 품목별 두 기간 비교 행 */
export interface PriceAnalysisRow {
  key: string;
  name: string;
  unifiedProductId: string | null;
  aPrice: number; // 기간 A 수량가중 평균 할인후 단가
  bPrice: number; // 기간 B
  aQty: number;
  bQty: number;
  deltaAbs: number; // bPrice - aPrice
  deltaPct: number | null; // %
  /** 단가가 2배 이상 뛰었거나 절반 이하로 떨어짐 — 입력 오류일 수 있어 인상률 계산에서 뺀다 */
  suspect: boolean;
}

/** 단가 분석 결과 */
export interface PriceAnalysisResult {
  rows: PriceAnalysisRow[]; // 두 기간 모두 존재 (변화율 내림차순)
  weightedInflationPct: number | null; // 라스파이레스(과거 A 구매량 가중)
  simpleAvgPct: number | null; // 단순 품목평균 (참고)
  basketBase: number; // Σ aQty×aPrice
  basketNow: number; // Σ aQty×bPrice
  comparedCount: number;
  /** 급변해서 인상률 계산에서 뺀 품목 수 */
  suspectCount: number;
  newItems: { name: string; bPrice: number; bQty: number }[]; // B 기간에만
  droppedItems: { name: string; aPrice: number; aQty: number }[]; // A 기간에만
}

/** 품목 단가 추이 한 점 */
export interface ItemTrendPoint {
  date: string | null;
  vendorName: string;
  unitPrice: number;
  listPrice: number;
  quantity: number;
}
