"use server";

import { requireAdmin } from "@/lib/supabase/server";
import { transformRpcResponse } from "@/lib/utils/dashboard";
import {
  computeAlerts,
  computeLeadTime,
  computeSpend,
  type AlertOrderRow,
  type LeadTimeOrderRow,
  type SpendOrderRow,
  type VendorMini,
  type VendorProductMini,
  type AliasMini,
} from "@/lib/utils/dashboard-extras";
import type { DashboardData } from "@/lib/types/dashboard";

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
    const spendSince = new Date(now.getFullYear(), now.getMonth() - (SPEND_MONTHS - 1), 1).toISOString();

    const [activeRes, inspectedRes, spendRes, vendorsRes, vpRes, aliasRes] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, status, item_name, quantity, unit, is_urgent, vendor_name, created_at, dispatched_at, updated_at, return_requested_at, requester:profiles!requester_id(full_name)"
        )
        .in("status", ["pending", "ordered", "return_requested"]),
      supabase
        .from("orders")
        .select("item_name, created_at, dispatched_at, inspected_at")
        .eq("type", "order")
        .not("inspected_at", "is", null)
        .gte("inspected_at", leadTimeSince),
      supabase
        .from("orders")
        .select("item_name, quantity, vendor_name, created_at")
        .eq("type", "order")
        .gte("created_at", spendSince),
      supabase.from("vendors").select("id, name"),
      supabase.from("vendor_products").select("vendor_id, product_name, unit_price, unified_product_id"),
      supabase.from("item_name_aliases").select("item_name, unified_product_id"),
    ]);

    const alerts = computeAlerts((activeRes.data ?? []) as unknown as AlertOrderRow[]);
    const leadTime = computeLeadTime((inspectedRes.data ?? []) as unknown as LeadTimeOrderRow[]);
    const spend = computeSpend(
      (spendRes.data ?? []) as unknown as SpendOrderRow[],
      (vendorsRes.data ?? []) as unknown as VendorMini[],
      (vpRes.data ?? []) as unknown as VendorProductMini[],
      (aliasRes.data ?? []) as unknown as AliasMini[],
      SPEND_MONTHS,
    );

    return { ...core, alerts, leadTime, spend };
  } catch {
    return core;
  }
}
