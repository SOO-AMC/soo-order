"use server";

import { requireAdmin } from "@/lib/supabase/server";
import { transformRpcResponse } from "@/lib/utils/dashboard";
import {
  computeAlerts,
  computeLeadTime,
  computeInvoiceSpend,
  spendMonthLabels,
  type AlertOrderRow,
  type LeadTimeOrderRow,
} from "@/lib/utils/dashboard-extras";
import { fetchInvoiceLines } from "@/lib/invoices/lines";
import { fetchAllPages } from "@/lib/supabase/paginate";
import { kstToday } from "@/lib/utils/period";
import type { DashboardData, RecentOrderRow } from "@/lib/types/dashboard";

interface RecentOrderQueryRow {
  id: string;
  item_name: string;
  quantity: number;
  unit: string | null;
  status: string;
  created_at: string;
  requester: { full_name: string | null } | null;
}

const SPEND_MONTHS = 6;

export async function fetchDashboardData(): Promise<DashboardData> {
  const { supabase } = await requireAdmin();

  const { data: rpcData, error: rpcError } = await supabase.rpc("get_dashboard_stats");
  if (rpcError || !rpcData) {
    throw new Error(`Dashboard RPC failed: ${rpcError?.message ?? "no data"}`);
  }
  const core = transformRpcResponse(rpcData as Record<string, unknown>);

  // 추가 인사이트 (계산 실패해도 코어는 반환)
  try {
    const now = new Date();
    const leadTimeSince = new Date(now.getTime() - 130 * 86400000).toISOString();
    const today = kstToday();
    const spendSince = `${spendMonthLabels(today, SPEND_MONTHS)[0]}-01`;

    // 줄 수가 1,000을 넘을 수 있는 조회(검수 이력·명세서 줄)는 끝까지 읽는다
    const [activeRes, inspected, spendLines, vendorsRes, recentRes] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, status, item_name, quantity, unit, is_urgent, vendor_name, created_at, dispatched_at, updated_at, return_requested_at, requester:profiles!requester_id(full_name)"
        )
        .in("status", ["pending", "ordered", "return_requested"]),
      fetchAllPages<LeadTimeOrderRow>(
        (from, to) =>
          supabase
            .from("orders")
            .select("item_name, created_at, dispatched_at, inspected_at")
            .eq("type", "order")
            .not("inspected_at", "is", null)
            .gte("inspected_at", leadTimeSince)
            .order("id")
            .range(from, to),
        { label: "검수 이력" },
      ),
      fetchInvoiceLines(supabase, { start: spendSince }),
      supabase.from("vendors").select("id, name"),
      supabase
        .from("orders")
        .select("id, item_name, quantity, unit, status, created_at, requester:profiles!requester_id(full_name)")
        .eq("type", "order")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    const alerts = computeAlerts((activeRes.data ?? []) as unknown as AlertOrderRow[]);
    const leadTime = computeLeadTime(inspected);
    const vendorNameById = new Map(((vendorsRes.data ?? []) as { id: string; name: string }[]).map((v) => [v.id, v.name] as const));
    const spend = computeInvoiceSpend(spendLines, vendorNameById, today, SPEND_MONTHS);
    const recentOrders: RecentOrderRow[] = ((recentRes.data ?? []) as unknown as RecentOrderQueryRow[]).map((o) => ({
      id: o.id,
      itemName: o.item_name,
      quantity: o.quantity,
      unit: o.unit ?? "",
      status: o.status,
      requester: o.requester?.full_name ?? "",
      createdAt: o.created_at,
    }));

    return { ...core, alerts, leadTime, spend, recentOrders };
  } catch (e) {
    console.error("[dashboard] 추가 지표 계산 실패", e);
    return core;
  }
}
