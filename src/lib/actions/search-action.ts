"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchSearchOrders } from "@/lib/queries/search-orders";
import type { SearchFilters } from "@/lib/utils/search-params";

export async function searchOrders(filters: SearchFilters) {
  const supabase = await createClient();
  return fetchSearchOrders(supabase, filters);
}
