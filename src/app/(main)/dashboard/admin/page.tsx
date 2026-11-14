import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { DashboardPage } from "@/components/dashboard/dashboard-page";

export default async function AdminDashboardRoute() {
  // 관리자 전용. (데이터는 서버에서 이미 관리자만 받지만, 화면 자체도 열리지 않게 한다)
  const { isAdmin } = await getSessionProfile();
  if (!isAdmin) redirect("/dashboard");

  // 데이터는 화면이 뜬 뒤에 한 번만 읽는다. 여기서도 읽으면 같은 무거운 조회가 두 번 돌고, 그동안 화면 이동이 멈춘다.
  return <DashboardPage />;
}
