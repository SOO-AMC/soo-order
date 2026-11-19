/** 업체 관리 화면용 타입 */

export interface VendorAliasEntry {
  id: string;
  alias: string;
}

export interface VendorEntry {
  id: string;
  name: string;
  discountRate: number;
  /** 가격 비교표에 열로 나오는 주력 업체인가 */
  showInCompare: boolean;
  aliases: VendorAliasEntry[];
  /** 이 이름으로 적힌 주문 수 */
  orderCount: number;
  /** 이 업체로 확정한 명세서 수 */
  invoiceCount: number;
}

/** 주문에 적혀 있지만 등록된 업체 이름이 아닌 글자 */
export interface UnlinkedName {
  name: string;
  count: number;
  lastAt: string | null;
  /** (주)·띄어쓰기만 달라서 바로 정리할 수 있는 업체 */
  autoTarget: { id: string; name: string } | null;
  /** 비슷한 이름의 업체 후보 (자동으로는 연결하지 않음) */
  suggestions: { id: string; name: string }[];
  /** 이 이름의 주문 중 명세서와 연결된 건수, 그 명세서들의 업체 */
  invoiceCount: number;
  invoiceVendor: { id: string; name: string } | null;
  /** 우리 병원 이름을 업체로 잘못 읽은 것으로 보임 */
  ownHospital: boolean;
}

/** "정리할 이름" 근거: 이 이름이 적힌 주문·명세서, 그 품목을 파는 업체 */
export interface VendorNameEvidence {
  orders: {
    id: string;
    itemName: string;
    quantity: number;
    unit: string;
    status: string;
    createdAt: string;
    dispatchedAt: string | null;
    requester: string | null;
    /** 마지막으로 손댄 사람(발주·검수한 관리자) */
    updater: string | null;
    /** 주문의 메모들 — 업체 이름이 아닌 글자가 업체 칸에 들어간 이유가 여기 있는 경우가 많다 */
    notes: string[];
  }[];
  /** 이 이름이 적힌 주문 수 (orders 는 최근 것만) */
  total: number;
  /** 이 주문들과 연결된 명세서 */
  invoices: {
    id: string;
    date: string | null;
    /** 명세서에서 읽은 업체 글자 */
    readName: string | null;
    vendorId: string | null;
    vendorName: string | null;
    totalAmount: number | null;
    /** 이 이름의 주문과 맞춰진 줄 */
    lines: string[];
    filePath: string | null;
  }[];
  /** 이 주문들의 품목을 가격표에 가진 업체 (많이 가진 순) */
  carriers: { id: string; name: string; items: number }[];
  /** carriers 를 셀 때 쓴 품목 수 (가격표와 연결된 것만) */
  linkedItems: number;
}

export interface VendorDirectory {
  /** false 면 supabase/migrate-vendor-unify.sql 을 아직 실행하지 않은 것 */
  ready: boolean;
  vendors: VendorEntry[];
  unlinked: UnlinkedName[];
}

/** 업체 고르기(발주 창 등)용 */
export interface VendorOption {
  id: string;
  name: string;
  aliases: string[];
}

export type VendorActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
