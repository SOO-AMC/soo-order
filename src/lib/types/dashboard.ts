export interface SummaryData {
  pending: number;
  ordered: number;
  inspecting: number;
  returnRequested: number;
  pendingYesterday: number;
  orderedYesterday: number;
  inspectingYesterday: number;
  returnRequestedYesterday: number;
  urgentPending: number;
  urgentOrdered: number;
}

export interface TrendDataPoint {
  label: string;
  count: number;
}

export interface TopItemData {
  name: string;
  count: number;
}

export interface VendorData {
  vendor: string;
  total: number;
  invoiceReceived: number;
}

export interface ReturnItemData {
  name: string;
  count: number;
}

export interface RecentReturnData {
  itemName: string;
  reason: string;
  date: string;
  requester: string;
}

export interface ReturnAnalysisData {
  totalInspected: number;
  totalReturned: number;
  returnRate: number;
  topItems: ReturnItemData[];
  recentReasons: RecentReturnData[];
}

// ── 할 일 알림 패널 (B) ──
export interface AlertItem {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  requester: string;
  vendor: string;
  days: number; // 며칠 됐는지
  isUrgent: boolean;
  status: string;
}
export interface AlertSection {
  count: number;
  items: AlertItem[]; // 상위 N개만
}
export interface AlertsData {
  agingPending: AlertSection; // 주문신청된 지 오래됨 (까먹은 주문)
  agingOrdered: AlertSection; // 검수대기 오래됨 (입고 지연)
  agingReturns: AlertSection; // 반품신청 묵힘
  urgentUnhandled: AlertSection; // 긴급인데 아직 처리 안 됨
  thresholds: { pendingDays: number; orderedDays: number; returnDays: number };
}

// ── 처리 시간 / 병목 (A) ──
export interface LeadTimeStage {
  key: string;
  label: string; // 예: "주문신청 → 발주"
  avgHours: number; // 최근 windowDays 평균
  avgHoursPrev: number; // 직전 동기간 평균 (비교)
  count: number; // 표본 수
}
export interface SlowItem {
  name: string;
  hours: number;
}
export interface LeadTimeData {
  windowDays: number;
  stages: LeadTimeStage[];
  slowestToDispatch: SlowItem[]; // 발주가 느렸던 품목
  slowestToInspect: SlowItem[]; // 검수까지 느렸던 품목
}

// ── 지출 추이 (C, 가격매칭 기반 추정) ──
export interface SpendMonthPoint {
  label: string; // "2026-03"
  amount: number;
}
export interface SpendVendorPoint {
  vendor: string;
  amount: number;
}
export interface SpendData {
  monthly: SpendMonthPoint[];
  byVendorThisMonth: SpendVendorPoint[];
  matchedCount: number; // 금액 계산된(매칭된) 주문 수
  totalCount: number; // 같은 기간 전체 주문 수
  thisMonthAmount: number;
  lastMonthAmount: number;
}

export interface RecentOrderRow {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  status: string;
  requester: string;
  createdAt: string;
}

export interface DashboardData {
  summary: SummaryData;
  dailyTrend: TrendDataPoint[];
  weeklyTrend: TrendDataPoint[];
  monthlyTrend: TrendDataPoint[];
  topItems: TopItemData[];
  vendors: VendorData[];
  returnAnalysis: ReturnAnalysisData;
  // fetchDashboardData에서 추가로 계산해 머지 (계산 실패 시 undefined)
  alerts?: AlertsData;
  leadTime?: LeadTimeData;
  spend?: SpendData;
  recentOrders?: RecentOrderRow[];
}
