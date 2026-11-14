import { NextResponse } from "next/server";
import { runArrivalDelayCheck } from "@/lib/orders/run-arrival-delay";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 입고 지연 자동 알림 (Vercel Cron용, 하루 한 번).
 *
 * 하는 일: 발주한 지 7일이 넘도록 검수대기에 머무는 주문을 찾아 주문자와 관리자에게 알린다.
 *          7일째에 한 번, 그 뒤로 7일마다 한 번. 주문자마다·관리자마다 한 통으로 묶는다.
 * 하루에 여러 번·동시에 불려도 같은 알림은 한 번만 나간다 (order_delay_notices 가 막는다).
 *
 * 안전 장치: ARRIVAL_DELAY_NOTIFY=on 이 아니면 **아무것도 보내지 않고 건수만 돌려준다**(시험 실행).
 *
 * 배포 전: vercel.json 에 등록하지 않았다. 등록할 때는 (매일 09:00 KST = UTC 00:00)
 *   { "crons": [{ "path": "/api/arrival-delay", "schedule": "0 0 * * *" }] }
 * 그리고 CRON_SECRET 을 반드시 설정한다(없으면 누구나 부를 수 있다).
 * 먼저 supabase/migrate-arrival-delay.sql 을 실행해야 한다.
 *
 * 응답에는 건수만 담는다 — 주문 내용은 담지 않는다.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runArrivalDelayCheck();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[arrival-delay] 입고 지연 확인 실패:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
