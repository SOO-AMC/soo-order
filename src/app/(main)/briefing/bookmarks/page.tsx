import type { Metadata } from "next";
import { getSessionProfile } from "@/lib/supabase/server";
import { fetchBookmarkedPapers } from "@/lib/actions/briefing-reader-actions";
import { BriefingHeader } from "@/components/briefing/reader/today-page";
import { BookmarksPage } from "@/components/briefing/reader/bookmarks-page";
import { BriefingLoadError } from "@/components/briefing/reader/load-error";

export const metadata: Metadata = { title: "북마크한 논문" };
export const dynamic = "force-dynamic";

/** 내 북마크 (전 직원, 본인 것만) */
export default async function BriefingBookmarksPage() {
  const { isAdmin } = await getSessionProfile();
  const papers = await fetchBookmarkedPapers().catch(() => null);
  return (
    <>
      <BriefingHeader isAdmin={isAdmin} />
      {papers ? <BookmarksPage papers={papers} /> : <BriefingLoadError />}
    </>
  );
}
