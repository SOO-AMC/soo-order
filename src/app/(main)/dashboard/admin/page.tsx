import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { fetchDashboardData } from "@/lib/actions/dashboard-action";
import type { DashboardData } from "@/lib/types/dashboard";

export default async function AdminDashboardRoute() {
  // 관리자 전용. (데이터는 서버에서 이미 관리자만 받지만, 화면 자체도 열리지 않게 한다)
  const { isAdmin } = await getSessionProfile();
  if (!isAdmin) redirect("/dashboard");

  let initialData: DashboardData | undefined;
  try {
    initialData = await fetchDashboardData();
  } catch {
    // 실패 시 클라이언트가 다시 fetch
  }
  return <DashboardPage initialData={initialData} />;
}
