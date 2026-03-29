"use server";

import { requireAdmin } from "@/lib/supabase/server";
import { transformRpcResponse } from "@/lib/utils/dashboard";
import type { DashboardData } from "@/lib/types/dashboard";

export async function fetchDashboardData(): Promise<DashboardData> {
  const { supabase } = await requireAdmin();
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_dashboard_stats");

  if (rpcError || !rpcData) {
    throw new Error(`Dashboard RPC failed: ${rpcError?.message ?? "no data"}`);
  }

  return transformRpcResponse(rpcData as Record<string, unknown>);
}
