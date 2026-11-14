/**
 * 입고 지연 알림 — 누구에게 무엇을 보낼지 정하는 규칙 (순수 함수, DB 를 건드리지 않는다).
 *
 * 규칙
 * - 발주한 지 7일이 지나도 검수대기에 머무는 주문이 대상이다 (관리자 "처리할 일"의 기준과 같다).
 * - 7일째에 한 번, 그 뒤로 7일마다 한 번씩 알린다 (14일째, 21일째 …). 매일 보내지 않는다.
 * - 주문자에게는 주문자마다 한 통, 관리자에게는 관리자마다 한 통으로 묶는다.
 * - 관리자가 주문자인 주문은 관리자용 한 통에 들어 있으므로 따로 보내지 않는다.
 */

import type { NotificationRow } from "@/lib/utils/order-notify";

/** 발주 뒤 며칠부터 지연으로 볼지 */
export const DELAY_FIRST_DAYS = 7;
/** 그 뒤로 며칠마다 다시 알릴지 */
export const DELAY_REPEAT_DAYS = 7;
/** 알림 한 통에 품목을 몇 줄까지 적을지 */
const MAX_LINES = 5;

export interface DelayOrder {
  id: string;
  requester_id: string | null;
  item_name: string;
  vendor_name: string | null;
  /** 발주한 때. 없으면(예전 주문) 주문한 때를 쓴다 */
  dispatched_at: string | null;
  created_at: string;
}

export interface DueNotice {
  order: DelayOrder;
  /** 발주 뒤 지난 날 수 */
  days: number;
  /** 이번에 보내는 알림의 단계 (7, 14, 21 …) */
  milestone: number;
}

/** 발주(없으면 주문) 뒤 지난 날 수 */
export function daysWaiting(order: Pick<DelayOrder, "dispatched_at" | "created_at">, now: Date): number {
  const since = Date.parse(order.dispatched_at ?? order.created_at);
  if (!Number.isFinite(since)) return 0;
  return Math.max(0, Math.floor((now.getTime() - since) / 86_400_000));
}

/** 지난 날 수가 해당하는 알림 단계. 아직 지연이 아니면 null. 예: 6 → null, 7~13 → 7, 14~20 → 14, 33 → 28 */
export function delayMilestone(days: number): number | null {
  if (days < DELAY_FIRST_DAYS) return null;
  return DELAY_FIRST_DAYS + Math.floor((days - DELAY_FIRST_DAYS) / DELAY_REPEAT_DAYS) * DELAY_REPEAT_DAYS;
}

export const noticeKey = (orderId: string, milestone: number) => `${orderId}:${milestone}`;

/** 지금 알려야 하는 주문: 지연 단계에 들어섰는데 그 단계의 알림을 아직 안 보낸 것 */
export function findDue(orders: DelayOrder[], alreadySent: Set<string>, now: Date): DueNotice[] {
  const due: DueNotice[] = [];
  for (const order of orders) {
    const days = daysWaiting(order, now);
    const milestone = delayMilestone(days);
    if (milestone == null || alreadySent.has(noticeKey(order.id, milestone))) continue;
    due.push({ order, days, milestone });
  }
  return due.sort((a, b) => b.days - a.days);
}

const line = (d: DueNotice) => `${d.order.item_name} · 발주 ${d.days}일째${d.order.vendor_name?.trim() ? ` · ${d.order.vendor_name.trim()}` : ""}`;

function lines(list: DueNotice[]): string {
  const shown = list.slice(0, MAX_LINES).map(line);
  if (list.length > MAX_LINES) shown.push(`외 ${list.length - MAX_LINES}건`);
  return shown.join("\n");
}

/** 보낼 알림: 주문자마다 한 통 + 관리자마다 한 통 */
export function delayNotifications(due: DueNotice[], adminIds: string[]): NotificationRow[] {
  if (due.length === 0) return [];
  const admins = new Set(adminIds);
  const rows: NotificationRow[] = [];

  // 주문자 (관리자 본인의 주문은 관리자용 알림에 들어 있다)
  const byRequester = new Map<string, DueNotice[]>();
  for (const d of due) {
    const uid = d.order.requester_id;
    if (!uid || admins.has(uid)) continue;
    byRequester.set(uid, [...(byRequester.get(uid) ?? []), d]);
  }
  for (const [userId, list] of byRequester) {
    if (list.length === 1) {
      const d = list[0];
      rows.push({
        user_id: userId,
        order_id: d.order.id,
        type: "arrival_delayed",
        title: `'${d.order.item_name}' 입고가 늦어지고 있어요`,
        body: `발주 ${d.days}일째${d.order.vendor_name?.trim() ? ` · ${d.order.vendor_name.trim()}` : ""}\n관리자가 업체에 확인할 거예요. 급하면 관리자에게 알려 주세요.`,
        link: `/orders/${d.order.id}`,
      });
    } else {
      rows.push({
        user_id: userId,
        order_id: null,
        type: "arrival_delayed",
        title: `주문 ${list.length}건의 입고가 늦어지고 있어요`,
        body: `${lines(list)}\n관리자가 업체에 확인할 거예요. 급하면 관리자에게 알려 주세요.`,
        link: "/dashboard",
      });
    }
  }

  // 관리자
  for (const adminId of admins) {
    rows.push({
      user_id: adminId,
      order_id: due.length === 1 ? due[0].order.id : null,
      type: "arrival_delayed",
      title: `${DELAY_FIRST_DAYS}일 넘게 입고 안 된 주문 ${due.length}건`,
      body: `${lines(due)}\n업체에 확인해 보세요.`,
      link: "/inspection",
    });
  }
  return rows;
}
