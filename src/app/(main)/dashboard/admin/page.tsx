import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { fetchDashboardData } from "@/lib/actions/dashboard-action";
import type { DashboardData } from "@/lib/types/dashboard";

export default async function AdminDashboardRoute() {
  let initialData: DashboardData | undefined;
  try {
    initialData = await fetchDashboardData();
  } catch {
    // 실패 시 클라이언트가 다시 fetch
  }
  return <DashboardPage initialData={initialData} />;
}
