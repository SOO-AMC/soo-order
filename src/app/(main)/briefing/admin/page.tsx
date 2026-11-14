import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { fetchIssueSummaries, type IssueSummary } from "@/lib/actions/briefing-admin-actions";
import { BriefingAdminHome } from "@/components/briefing/admin/admin-home";
import { defaultIssueDate, kstDate } from "@/lib/briefing/kst";

export const metadata: Metadata = { title: "논문 브리핑 관리" };
export const dynamic = "force-dynamic";

export default async function BriefingAdminPage() {
  const { isAdmin } = await getSessionProfile();
  if (!isAdmin) redirect("/dashboard");

  let issues: IssueSummary[] = [];
  let loadError = false;
  try {
    issues = await fetchIssueSummaries();
  } catch {
    loadError = true;
  }
  return <BriefingAdminHome issues={issues} today={kstDate()} nextDate={defaultIssueDate()} loadError={loadError} />;
}
