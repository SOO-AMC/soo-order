"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchAllSearchOrders } from "@/lib/queries/search-orders";
import type { SearchFilters } from "@/lib/utils/search-params";
import type { OrderWithRequester } from "@/lib/types/order";

export async function exportFilteredOrders(
  filters: SearchFilters
): Promise<{ orders: OrderWithRequester[]; error?: string }> {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { orders: [], error: "인증이 필요합니다." };
  }

  // admin 권한 확인
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (profile?.role !== "admin") {
    return { orders: [], error: "관리자만 다운로드할 수 있습니다." };
  }

  const orders = await fetchAllSearchOrders(supabase, filters);
  return { orders };
}
