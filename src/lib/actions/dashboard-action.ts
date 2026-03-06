"use server";

import { createClient } from "@/lib/supabase/server";
import { transformRpcResponse } from "@/lib/utils/dashboard";
import { computeFirebaseAnalytics } from "@/lib/utils/firebase-analytics";
import type { DashboardData, FirebaseItem } from "@/lib/types/dashboard";
import firebaseItemsJson from "@/data/firebase-items.json";

const firebaseItems = firebaseItemsJson as FirebaseItem[];

export async function fetchDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_dashboard_stats");

  if (rpcError || !rpcData) {
    throw new Error(`Dashboard RPC failed: ${rpcError?.message ?? "no data"}`);
  }

  const dashboardData = transformRpcResponse(rpcData as Record<string, unknown>);

  dashboardData.firebase = firebaseItems.length > 0
    ? computeFirebaseAnalytics(firebaseItems)
    : null;

  return dashboardData;
}
