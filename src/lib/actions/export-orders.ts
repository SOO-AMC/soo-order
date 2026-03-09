"use server";

import { requireAdmin } from "@/lib/supabase/server";
import { fetchAllSearchOrders } from "@/lib/queries/search-orders";
import type { SearchFilters } from "@/lib/utils/search-params";
import type { OrderWithRequester } from "@/lib/types/order";

export async function exportFilteredOrders(
  filters: SearchFilters
): Promise<{ orders: OrderWithRequester[]; error?: string }> {
  try {
    const { supabase } = await requireAdmin();
    const orders = await fetchAllSearchOrders(supabase, filters);
    return { orders };
  } catch {
    return { orders: [], error: "관리자만 다운로드할 수 있습니다." };
  }
}
