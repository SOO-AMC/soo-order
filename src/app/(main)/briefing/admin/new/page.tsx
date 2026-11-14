import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { defaultIssueDate } from "@/lib/briefing/kst";

export const dynamic = "force-dynamic";

/** 새 논문 등록: 다음 발행일(오늘 08:30 전이면 오늘, 지났으면 내일)의 작업 화면으로 보낸다 */
export default async function BriefingNewPaperPage() {
  const { isAdmin } = await getSessionProfile();
  if (!isAdmin) redirect("/dashboard");
  redirect(`/briefing/admin/${defaultIssueDate()}?new=1`);
}
