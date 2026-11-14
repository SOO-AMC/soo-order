import { createAdminClient } from "@/lib/supabase/admin";
import { chunk, fetchAllPages } from "@/lib/supabase/paginate";
import { delayNotifications, findDue, noticeKey, DELAY_FIRST_DAYS, daysWaiting, type DelayOrder } from "./arrival-delay";

/**
 * 입고 지연 확인 실행 (예약 실행용 — 로그인한 사람 없이 돌므로 service_role 로 읽고 쓴다).
 *
 * 안전 장치
 * - `ARRIVAL_DELAY_NOTIFY=on` 일 때만 실제로 알림을 보낸다. 그 밖에는 "보낼 건수"만 세고 아무것도 쓰지 않는다(시험 실행).
 * - 보낸 기록(order_delay_notices)을 **먼저** 넣고, 실제로 들어간 것만 알린다.
 *   기록의 열쇠가 (주문, 며칠째)라서 하루에 여러 번·동시에 불려도 같은 알림은 한 번만 나간다.
 *
 * "use server" 파일이 아니다. 라우트 핸들러(/api/arrival-delay)에서만 부른다.
 */

export interface ArrivalDelayResult {
  /** 실제로 알림을 보냈는가 (false = 시험 실행) */
  live: boolean;
  /** 검수대기 주문 수 */
  waiting: number;
  /** 그중 7일 넘게 안 들어온 주문 수 */
  delayed: number;
  /** 이번에 새로 알려야 하는 주문 수 */
  due: number;
  /** 보낸(시험 실행이면 보냈을) 알림 수 */
  notifications: number;
}

export function arrivalDelayLive(): boolean {
  return process.env.ARRIVAL_DELAY_NOTIFY === "on";
}

export async function runArrivalDelayCheck(now: Date = new Date()): Promise<ArrivalDelayResult> {
  const supabase = createAdminClient();
  const live = arrivalDelayLive();

  // 1) 검수대기 주문
  const orders = await fetchAllPages<DelayOrder>(
    (from, to) =>
      supabase
        .from("orders")
        .select("id, requester_id, item_name, vendor_name, dispatched_at, created_at")
        .eq("type", "order")
        .eq("status", "ordered")
        .order("id")
        .range(from, to),
    { label: "검수대기 주문" },
  );
  const delayed = orders.filter((o) => daysWaiting(o, now) >= DELAY_FIRST_DAYS);
  const base = { live, waiting: orders.length, delayed: delayed.length };
  if (delayed.length === 0) return { ...base, due: 0, notifications: 0 };

  // 2) 이미 보낸 기록
  const sent = new Set<string>();
  for (const ids of chunk(delayed.map((o) => o.id), 100)) {
    const { data, error } = await supabase.from("order_delay_notices").select("order_id, milestone").in("order_id", ids);
    if (error) throw new Error(`보낸 기록을 읽지 못했어요 (supabase/migrate-arrival-delay.sql 실행 여부 확인): ${error.message}`);
    for (const r of (data ?? []) as { order_id: string; milestone: number }[]) sent.add(noticeKey(r.order_id, r.milestone));
  }

  // 3) 이번에 알릴 주문
  const due = findDue(delayed, sent, now);
  if (due.length === 0) return { ...base, due: 0, notifications: 0 };

  // 4) 관리자 (알림 받을 사람)
  const { data: adminRows, error: adminErr } = await supabase.from("profiles").select("id, is_active").eq("role", "admin");
  if (adminErr) throw new Error(`관리자 목록을 읽지 못했어요: ${adminErr.message}`);
  const adminIds = ((adminRows ?? []) as { id: string; is_active: boolean | null }[]).filter((a) => a.is_active !== false).map((a) => a.id);

  if (!live) {
    return { ...base, due: due.length, notifications: delayNotifications(due, adminIds).length };
  }

  // 5) 보낸 기록을 먼저 넣는다 — 이미 있는 것은 건너뛰고, 실제로 들어간 것만 돌려받는다
  const { data: inserted, error: insErr } = await supabase
    .from("order_delay_notices")
    .upsert(due.map((d) => ({ order_id: d.order.id, milestone: d.milestone })), { onConflict: "order_id,milestone", ignoreDuplicates: true })
    .select("order_id, milestone");
  if (insErr) throw new Error(`보낸 기록을 남기지 못했어요: ${insErr.message}`);
  const mine = new Set(((inserted ?? []) as { order_id: string; milestone: number }[]).map((r) => noticeKey(r.order_id, r.milestone)));
  const toSend = due.filter((d) => mine.has(noticeKey(d.order.id, d.milestone)));
  if (toSend.length === 0) return { ...base, due: 0, notifications: 0 }; // 다른 실행이 먼저 처리했다

  // 6) 알림
  const rows = delayNotifications(toSend, adminIds);
  const { error: notifyErr } = await supabase.from("notifications").insert(rows);
  if (notifyErr) throw new Error(`알림을 저장하지 못했어요: ${notifyErr.message}`);

  return { ...base, due: toSend.length, notifications: rows.length };
}
