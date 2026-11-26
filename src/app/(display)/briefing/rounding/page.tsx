import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { fetchRecentPastBriefings, fetchTodayBriefing } from "@/lib/actions/briefing-reader-actions";
import { RoundingScreen } from "@/components/briefing/rounding/rounding-screen";
import { isPastPublishTime, kstDate } from "@/lib/briefing/kst";
import { publicAppUrl } from "@/lib/briefing/public-meta";

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

  // 쿠키에는 로그인이 남아 있어도 서버에서 이미 끝난 로그인일 수 있다(다른 기기에서 로그아웃 등).
  // 그때는 "불러오지 못했어요"가 아니라 "다시 로그인"을 보여 준다.
  let result: Awaited<ReturnType<typeof fetchTodayBriefing>> | null = null;
  let sessionExpired = false;
  try {
    result = await fetchTodayBriefing();
  } catch (e) {
    sessionExpired = e instanceof Error && e.message === "Unauthorized";
  }
  const today = result?.today ?? kstDate();
  // 오늘 것이 없을 때 골라서 틀 지난 브리핑 (못 불러와도 오늘 화면은 그대로)
  const pastIssues = sessionExpired ? [] : await fetchRecentPastBriefings().catch(() => []);
  return (
    <RoundingScreen
      today={today}
      issue={result?.issue ?? null}
      past={isPastPublishTime(today)}
      loadFailed={!result && !sessionExpired}
      sessionExpired={sessionExpired}
      pastIssues={pastIssues}
      isDisplayAccount={role === "display"}
      publicBase={publicAppUrl()}
    />
  );
}
