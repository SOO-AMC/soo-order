import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";

export default async function Home() {
  // 관리자는 첫 화면이 관리자 대시보드, 그 외는 내 주문 현황
  const { isAdmin } = await getSessionProfile();
  redirect(isAdmin ? "/dashboard/admin" : "/dashboard");
}
