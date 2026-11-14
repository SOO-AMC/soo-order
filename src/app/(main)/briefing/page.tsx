import type { Metadata } from "next";
import { getSessionProfile } from "@/lib/supabase/server";
import { fetchTodayBriefing } from "@/lib/actions/briefing-reader-actions";
import { BriefingHeader, TodayPage } from "@/components/briefing/reader/today-page";
import { BriefingLoadError } from "@/components/briefing/reader/load-error";
import { isPastPublishTime } from "@/lib/briefing/kst";

export const metadata: Metadata = { title: "논문 브리핑" };
export const dynamic = "force-dynamic";

/** 오늘의 논문 브리핑 (전 직원) — 발행된 것만 */
export default async function BriefingTodayPage() {
  const { isAdmin } = await getSessionProfile();
  const result = await fetchTodayBriefing().catch(() => null);
  if (!result) {
    return (
      <>
        <BriefingHeader isAdmin={isAdmin} />
        <BriefingLoadError />
      </>
    );
  }
  return <TodayPage today={result.today} issue={result.issue} isAdmin={isAdmin} past={isPastPublishTime(result.today)} />;
}
