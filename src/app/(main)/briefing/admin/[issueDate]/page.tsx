import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { fetchIssueByDate } from "@/lib/actions/briefing-admin-actions";
import { IssueWorkspace } from "@/components/briefing/admin/issue-workspace";
import { loadPlanConfig } from "@/lib/briefing/plan-sync";

export const metadata: Metadata = { title: "논문 브리핑 관리" };
export const dynamic = "force-dynamic";

/** 날짜별 작업 화면: 그날의 논문을 고치고, 카드를 만들고, 검수한다. 날짜가 9999-12-31 이면 날짜 미정 논문 */
export default async function BriefingIssuePage({
  params,
  searchParams,
}: {
  params: Promise<{ issueDate: string }>;
  searchParams: Promise<{ new?: string; paper?: string }>;
}) {
  const { isAdmin } = await getSessionProfile();
  if (!isAdmin) redirect("/dashboard");

  const { issueDate } = await params;
  const { new: startNew, paper } = await searchParams;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate) || Number.isNaN(new Date(`${issueDate}T00:00:00Z`).getTime())) notFound();

  const [issue, config] = await Promise.all([fetchIssueByDate(issueDate), loadPlanConfig(await createClient())]);
  // key: 날짜가 바뀌면 작업 화면을 새로 그린다(입력 중이던 글이 다른 날짜로 넘어가지 않게)
  return (
    <IssueWorkspace
      key={issueDate}
      issueDate={issueDate}
      initialIssue={issue}
      startNew={startNew === "1"}
      selectPaperId={typeof paper === "string" ? paper : undefined}
      limits={config.limits}
      planReady={config.ready}
    />
  );
}
