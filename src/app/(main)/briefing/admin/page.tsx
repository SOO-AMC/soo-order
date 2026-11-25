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
/** 논문 찾기·AI 카드 만들기(서버 동작)가 이 화면에서 불린다 — 분야 하나에 1~2분 걸릴 수 있다 */
export const maxDuration = 300;

export default async function BriefingAdminPage() {
  const { isAdmin } = await getSessionProfile();
  if (!isAdmin) redirect("/dashboard");

  // 새 올리기 화면(supabase/migrate-briefing-planner.sql)을 켰으면 그 화면. 데이터는 화면이 뜬 뒤 한 번만 읽는다.
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
