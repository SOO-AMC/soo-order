"use server";

import { requireUser } from "@/lib/supabase/server";
import type { Order, OrderStatus } from "@/lib/types/order";

export interface MyOrdersData {
  counts: Partial<Record<OrderStatus, number>>;
  activeOrders: Order[];
  recentCompleted: Order[];
}

export async function fetchMyOrdersStatus(): Promise<MyOrdersData> {
  const { supabase, userId } = await requireUser();
  const activeStatuses: OrderStatus[] = ["pending", "ordered", "out_of_stock", "return_requested", "return_pending"];

  const [activeResult, completedResult] = await Promise.all([
    // 내가 관련된 진행중 주문 (요청 또는 반품신청)
    supabase
      .from("orders")
      .select("*")
      .or(`requester_id.eq.${userId},return_requested_by.eq.${userId}`)
      .in("status", activeStatuses)
      .order("is_urgent", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    // 최근 검수완료 (내가 요청한 건)
    supabase
      .from("orders")
      .select("*")
      .eq("requester_id", userId)
      .eq("status", "inspecting")
      .order("inspected_at", { ascending: false })
      .limit(5),
  ]);

  if (activeResult.error) throw new Error(activeResult.error.message);
  if (completedResult.error) throw new Error(completedResult.error.message);

  const allActive = activeResult.data as Order[];
  const activeOrders = allActive.filter(
    (o) => o.requester_id === userId
      ? ["pending", "ordered", "out_of_stock"].includes(o.status)
      : o.return_requested_by === userId && ["return_requested", "return_pending"].includes(o.status)
  );
  const recentCompleted = completedResult.data as Order[];

  // 상태별 카운트 계산
  const counts: Partial<Record<OrderStatus, number>> = {};
  for (const order of activeOrders) {
    counts[order.status] = (counts[order.status] ?? 0) + 1;
  }
  if (recentCompleted.length > 0) {
    counts.inspecting = recentCompleted.length;
  }

  return { counts, activeOrders, recentCompleted };
}
