import { redirect } from "next/navigation";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { defaultIssueDate } from "@/lib/briefing/kst";
import { loadPlanConfig } from "@/lib/briefing/plan-sync";

export const dynamic = "force-dynamic";

/**
 * 새 논문 등록.
 * 대기함 방식이면 관리 첫 화면(올리기 상자)으로, 아니면 예전처럼 다음 발행일의 작업 화면으로 보낸다.
 */
export default async function BriefingNewPaperPage() {
  const { isAdmin } = await getSessionProfile();
  if (!isAdmin) redirect("/dashboard");
  const config = await loadPlanConfig(await createClient());
  redirect(config.ready ? "/briefing/admin" : `/briefing/admin/${defaultIssueDate()}?new=1`);
}
