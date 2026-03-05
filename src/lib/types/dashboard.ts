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
  firebase: FirebaseAnalyticsData | null;
}

// Firebase historical data types

export interface FirebaseItem {
  id: string;
  type: string | null;
  name: string;
  createdAt: string | null;
  requester: string | null;
  requestQty: string | null;
  companyNm: string | null;
  orderer: string | null;
  orderAt: string | null;
  recievedAt: string | null;
  confirmQty: string | null;
  inspector: string | null;
  progress: number | null;
  hasTS: boolean | null;
  lastEditer: string | null;
}

export interface ReorderIntervalData {
  name: string;
  avgDays: number;
  orderCount: number;
  lastOrderDate: string;
  daysSinceLastOrder: number;
}

export interface ItemVendorMapping {
  name: string;
  vendors: { vendor: string; count: number }[];
  totalOrders: number;
}

export interface VendorDeliverySpeed {
  vendor: string;
  avgHours: number;
  medianHours: number;
  count: number;
}

export interface FirebaseAnalyticsData {
  totalItems: number;
  dateRange: { from: string; to: string };
  reorderIntervals: ReorderIntervalData[];
  itemVendorMappings: ItemVendorMapping[];
  vendorDeliverySpeeds: VendorDeliverySpeed[];
}
