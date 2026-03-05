import type { DashboardData } from "@/lib/types/dashboard";

/**
 * RPC 함수 응답(JSONB)을 DashboardData 타입으로 변환
 */
export function transformRpcResponse(rpc: Record<string, unknown>): DashboardData {
  const summary = rpc.summary as DashboardData["summary"];
  const dailyTrend = rpc.dailyTrend as DashboardData["dailyTrend"];
  const weeklyTrend = rpc.weeklyTrend as DashboardData["weeklyTrend"];
  const monthlyTrend = rpc.monthlyTrend as DashboardData["monthlyTrend"];
  const topItems = rpc.topItems as DashboardData["topItems"];
  const vendors = rpc.vendors as DashboardData["vendors"];
  const returnAnalysis = rpc.returnAnalysis as DashboardData["returnAnalysis"];

  return {
    summary,
    dailyTrend,
    weeklyTrend,
    monthlyTrend,
    topItems,
    vendors,
    returnAnalysis,
    firebase: null,
  };
}
