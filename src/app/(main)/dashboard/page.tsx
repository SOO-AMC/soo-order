export const revalidate = 300; // 5분 ISR 캐시

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { transformRpcResponse } from "@/lib/utils/dashboard";
import { computeFirebaseAnalytics } from "@/lib/utils/firebase-analytics";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import type { FirebaseItem } from "@/lib/types/dashboard";
import firebaseItemsJson from "@/data/firebase-items.json";

const firebaseItems = firebaseItemsJson as FirebaseItem[];

export default async function DashboardRoute() {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/login");

  const [{ data: profile }, { data: rpcData, error: rpcError }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", session.user.id).single(),
    supabase.rpc("get_dashboard_stats"),
  ]);

  if (profile?.role !== "admin") redirect("/orders");

  if (rpcError || !rpcData) {
    throw new Error(`Dashboard RPC failed: ${rpcError?.message ?? "no data"}`);
  }

  const dashboardData = transformRpcResponse(rpcData as Record<string, unknown>);

  dashboardData.firebase = firebaseItems.length > 0
    ? computeFirebaseAnalytics(firebaseItems)
    : null;

  return <DashboardPage data={dashboardData} />;
}
