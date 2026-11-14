import type { Metadata } from "next";
import { getSessionProfile } from "@/lib/supabase/server";
import { searchBriefing } from "@/lib/actions/briefing-reader-actions";
import { BriefingHeader } from "@/components/briefing/reader/today-page";
import { ArchivePage } from "@/components/briefing/reader/archive-page";
import { BriefingLoadError } from "@/components/briefing/reader/load-error";
import { kstDate } from "@/lib/briefing/kst";

export const metadata: Metadata = { title: "지난 브리핑" };
export const dynamic = "force-dynamic";

/** 지난 브리핑 · 검색 (전 직원) */
export default async function BriefingArchivePage() {
  const { isAdmin } = await getSessionProfile();
  const issues = await searchBriefing().catch(() => null);
  return (
    <>
      <BriefingHeader isAdmin={isAdmin} />
      {issues ? <ArchivePage initial={issues} today={kstDate()} /> : <BriefingLoadError />}
    </>
  );
}
