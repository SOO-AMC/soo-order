export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { ActivityLogList } from "@/components/logs/activity-log-list";

export default async function LogsPage() {
  const { isAdmin } = await getSessionProfile();
  if (!isAdmin) redirect("/orders");

  const supabase = await createClient();
  const { data: logs } = await supabase
    .from("activity_logs")
    .select("id, user_name, category, action, description, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return <ActivityLogList initialData={logs ?? []} />;
}
