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
