import { NextResponse } from "next/server";
import { runDailyCron } from "@/lib/briefing/run-publish";
import { kstDate } from "@/lib/briefing/kst";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 논문 브리핑 자동 발행 (Vercel Cron용, 매일 08:30 KST = UTC 23:30 전날).
 *
 * 하는 일: 예약 시각이 지난 묶음을 발행 완료로 바꾸고 알림 기록을 만든다.
 *          오늘 08:30이 지났는데 발행이 없으면 관리자에게 하루 한 번 알린다.
 * 여러 번·동시에 불려도 날짜당 한 번만 발행되고 알림도 한 번만 나간다.
 *
 * 직원에게 보이는 시각은 이 크론과 무관하다: 예약 시각(08:30)이 지나면 바로 보인다.
 * 크론이 늦거나 빠져도 그날 처음 브리핑을 여는 사람이 같은 마무리를 한다.
 *
 * 배포 전: vercel.json 에 등록하지 않았다. 등록할 때는
 *   { "crons": [{ "path": "/api/briefing-publish", "schedule": "30 23 * * *" }] }
 * 그리고 CRON_SECRET 을 반드시 설정한다(없으면 누구나 부를 수 있다 — 불러도 예약된 것만 발행된다).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runDailyCron();
    return NextResponse.json({ ok: true, today: kstDate(), timezone: "Asia/Seoul", ...result });
  } catch (e) {
    console.error("[briefing] 자동 발행 실패:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "publish failed" }, { status: 500 });
  }
}
