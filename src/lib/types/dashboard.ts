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

export interface DashboardData {
  summary: SummaryData;
  dailyTrend: TrendDataPoint[];
  weeklyTrend: TrendDataPoint[];
  monthlyTrend: TrendDataPoint[];
  topItems: TopItemData[];
  vendors: VendorData[];
  returnAnalysis: ReturnAnalysisData;
}
