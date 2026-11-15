import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { fetchIssueSummaries, type IssueSummary } from "@/lib/actions/briefing-admin-actions";
import { BriefingAdminHome } from "@/components/briefing/admin/admin-home";
import { BriefingPlanner } from "@/components/briefing/admin/planner";
import { defaultIssueDate, kstDate } from "@/lib/briefing/kst";
import { loadPlanConfig } from "@/lib/briefing/plan-sync";

export const metadata: Metadata = { title: "논문 브리핑 관리" };
export const dynamic = "force-dynamic";

export default async function BriefingAdminPage() {
  const { isAdmin } = await getSessionProfile();
  if (!isAdmin) redirect("/dashboard");

  // 대기함 방식(supabase/migrate-briefing-planner.sql)을 켰으면 새 화면. 데이터는 화면이 뜬 뒤 한 번만 읽는다.
  const config = await loadPlanConfig(await createClient());
  if (config.ready) return <BriefingPlanner />;

  // 아직 켜지 않았으면 예전 화면(날짜별 목록) + 안내
  let issues: IssueSummary[] = [];
  let loadError = false;
  try {
    issues = await fetchIssueSummaries();
  } catch {
    loadError = true;
  }
  return <BriefingAdminHome issues={issues} today={kstDate()} nextDate={defaultIssueDate()} loadError={loadError} setupNotice />;
}
