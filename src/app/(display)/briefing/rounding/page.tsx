import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { fetchTodayBriefing } from "@/lib/actions/briefing-reader-actions";
import { RoundingScreen } from "@/components/briefing/rounding/rounding-screen";
import { isPastPublishTime, kstDate } from "@/lib/briefing/kst";

export const metadata: Metadata = { title: "라운딩 대기 모드" };
export const dynamic = "force-dynamic";

/**
 * 세미나실 라운딩 대기 모드.
 * (main) 레이아웃 밖에 둔다 — 공용 PC에 주문·관리 메뉴가 보이지 않는 읽기 전용 단독 화면.
 * 로그인은 그대로 필요하다(발행된 논문만 내려간다).
 */
export default async function BriefingRoundingPage() {
  const { session, role } = await getSessionProfile();
  if (!session) redirect("/login");

  const result = await fetchTodayBriefing().catch(() => null);
  const today = result?.today ?? kstDate();
  return <RoundingScreen today={today} issue={result?.issue ?? null} past={isPastPublishTime(today)} loadFailed={!result} isDisplayAccount={role === "display"} />;
}
