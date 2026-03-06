"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchSearchOrders } from "@/lib/queries/search-orders";
import type { SearchFilters } from "@/lib/utils/search-params";

export async function searchOrders(filters: SearchFilters) {
  const supabase = await createClient();
  return fetchSearchOrders(supabase, filters);
}

export async function fetchPersonNames(): Promise<string[]> {
  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("is_active", true)
    .order("full_name");

  return (profiles ?? [])
    .map((p) => p.full_name)
    .filter(Boolean) as string[];
}
