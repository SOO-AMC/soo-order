import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { DashboardPage } from "@/components/dashboard/dashboard-page";

export default async function DashboardRoute() {
  const { isAdmin } = await getSessionProfile();
  if (!isAdmin) redirect("/orders");

  return <DashboardPage />;
}
