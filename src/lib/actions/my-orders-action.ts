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
  const myStatuses: OrderStatus[] = ["pending", "ordered", "out_of_stock"];

  const [myResult, returnResult, completedResult] = await Promise.all([
    // 내가 요청한 진행중 주문
    supabase
      .from("orders")
      .select("*")
      .eq("requester_id", userId)
      .in("status", myStatuses)
      .order("is_urgent", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
    // 내가 반품 신청한 건
    supabase
      .from("orders")
      .select("*")
      .eq("return_requested_by", userId)
      .eq("status", "return_requested")
      .order("return_requested_at", { ascending: false })
      .limit(50),
    // 최근 검수완료 (내가 요청한 건)
    supabase
      .from("orders")
      .select("*")
      .eq("requester_id", userId)
      .eq("status", "inspecting")
      .order("inspected_at", { ascending: false })
      .limit(5),
  ]);

  if (myResult.error) throw new Error(myResult.error.message);
  if (returnResult.error) throw new Error(returnResult.error.message);
  if (completedResult.error) throw new Error(completedResult.error.message);

  const activeOrders = [...(myResult.data as Order[]), ...(returnResult.data as Order[])];
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
