"use server";

import { requireAdmin } from "@/lib/supabase/server";
import { computeAlerts, type AlertOrderRow } from "@/lib/utils/dashboard-extras";
import type { AlertsData } from "@/lib/types/dashboard";

/**
 * 처리할 일(관리자): 대시보드 "챙겨야 할 것"과 같은 계산.
 * 3일+ 미발주 · 7일+ 입고 안 됨 · 3일+ 반품 처리 안 됨 · 긴급인데 미처리.
 */
export async function fetchTodoAlerts(): Promise<AlertsData> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, status, item_name, quantity, unit, is_urgent, vendor_name, created_at, dispatched_at, updated_at, return_requested_at, requester:profiles!requester_id(full_name)"
    )
    .in("status", ["pending", "ordered", "return_requested"]);
  if (error) throw new Error("처리할 일을 불러오지 못했습니다.");
  return computeAlerts((data ?? []) as unknown as AlertOrderRow[]);
}
