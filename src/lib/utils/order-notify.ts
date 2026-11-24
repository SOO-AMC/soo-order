/**
 * 주문자에게 보내는 알림 문구 만들기 (순수 함수 — DB 를 건드리지 않는다).
 *
 * 원칙
 * - 한 번의 처리(여러 건 발주·검수·품절)는 주문자마다 알림 **한 통**으로 묶는다. 건마다 보내면 알림이 쏟아진다.
 * - 자기가 처리한 자기 주문에는 보내지 않는다.
 * - 이유가 있으면 항상 본문에 넣는다 — "왜 바뀌었지?"를 주문자가 다시 묻지 않게.
 */

export interface NotifyOrder {
  id: string;
  requester_id: string | null;
  item_name: string;
}

export interface NotificationRow {
  user_id: string;
  order_id: string | null;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
}

/** 알림 한 통에 품목을 몇 줄까지 적을지 */
const MAX_LINES = 5;

/** 여러 건을 주문자별로 묶는다 (처리한 사람 본인의 주문은 뺀다) */
function byRequester<T extends NotifyOrder>(orders: T[], actorId: string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const o of orders) {
    if (!o.requester_id || o.requester_id === actorId) continue;
    groups.set(o.requester_id, [...(groups.get(o.requester_id) ?? []), o]);
  }
  return groups;
}

function lines<T>(items: T[], line: (item: T) => string): string {
  const shown = items.slice(0, MAX_LINES).map(line);
  if (items.length > MAX_LINES) shown.push(`외 ${items.length - MAX_LINES}건`);
  return shown.join("\n");
}

/** 묶음 알림 공통: 1건이면 그 주문으로, 여러 건이면 내 주문 현황으로 보낸다 */
function grouped<T extends NotifyOrder>(
  orders: T[],
  actorId: string,
  type: string,
  one: (o: T) => { title: string; body: string | null; link: string },
  many: (list: T[]) => { title: string; body: string | null },
): NotificationRow[] {
  const rows: NotificationRow[] = [];
  for (const [userId, list] of byRequester(orders, actorId)) {
    if (list.length === 1) {
      const n = one(list[0]);
      rows.push({ user_id: userId, order_id: list[0].id, type, title: n.title, body: n.body, link: n.link });
    } else {
      const n = many(list);
      rows.push({ user_id: userId, order_id: null, type, title: n.title, body: n.body, link: "/dashboard" });
    }
  }
  return rows;
}

/** 발주했어요 */
export function dispatchNotifications(orders: (NotifyOrder & { vendor_name?: string | null })[], actorId: string): NotificationRow[] {
  const vendor = (o: { vendor_name?: string | null }) => (o.vendor_name?.trim() ? ` · ${o.vendor_name.trim()}` : "");
  return grouped(
    orders,
    actorId,
    "order_dispatched",
    (o) => ({ title: `'${o.item_name}' 발주했어요`, body: o.vendor_name?.trim() ? `업체: ${o.vendor_name.trim()}\n들어오면 다시 알려 드려요.` : "들어오면 다시 알려 드려요.", link: `/orders/${o.id}` }),
    (list) => ({ title: `주문 ${list.length}건을 발주했어요`, body: lines(list, (o) => `${o.item_name}${vendor(o)}`) }),
  );
}

/** 들어왔어요 (검수 완료) */
export function arrivalNotifications(orders: (NotifyOrder & { quantity?: number | null; unit?: string | null; note?: string | null })[], actorId: string): NotificationRow[] {
  const qty = (o: { quantity?: number | null; unit?: string | null }) => (o.quantity && o.quantity > 0 ? ` ${o.quantity}${o.unit ? ` ${o.unit}` : ""}` : "");
  const note = (o: { note?: string | null }) => (o.note?.trim() ? o.note.trim() : "");
  return grouped(
    orders,
    actorId,
    "inspection_completed",
    (o) => ({
      title: `'${o.item_name}' 들어왔어요`,
      body: [qty(o) ? `받은 수량:${qty(o)}` : "", note(o) ? `검수 비고: ${note(o)}` : ""].filter(Boolean).join("\n") || null,
      link: `/inspection/${o.id}`,
    }),
    (list) => ({ title: `주문 ${list.length}건이 들어왔어요`, body: lines(list, (o) => `${o.item_name}${qty(o)}${note(o) ? ` (${note(o)})` : ""}`) }),
  );
}

/** 일부만 들어왔어요 (부분 입고) */
export function partialNotifications(orders: (NotifyOrder & { received: number; quantity: number; unit?: string | null })[], actorId: string): NotificationRow[] {
  const part = (o: { received: number; quantity: number; unit?: string | null }) => `${o.quantity}${o.unit ? ` ${o.unit}` : ""} 중 ${o.received} 받음`;
  return grouped(
    orders,
    actorId,
    "partial_received",
    (o) => ({ title: `'${o.item_name}' 일부만 들어왔어요`, body: `${part(o)}\n나머지가 들어오면 다시 알려 드려요.`, link: `/inspection/${o.id}` }),
    (list) => ({ title: `주문 ${list.length}건이 일부만 들어왔어요`, body: lines(list, (o) => `${o.item_name} · ${part(o)}`) }),
  );
}

/** 품절이에요 — 사유를 항상 함께 보낸다 */
export function outOfStockNotifications(orders: NotifyOrder[], actorId: string, reason: string): NotificationRow[] {
  const why = reason.trim() ? `사유: ${reason.trim()}` : "사유는 적혀 있지 않아요.";
  return grouped(
    orders,
    actorId,
    "out_of_stock",
    (o) => ({ title: `'${o.item_name}' 품절이에요`, body: `${why}\n다른 품목이 필요하면 다시 주문해 주세요.`, link: `/out-of-stock/${o.id}` }),
    (list) => ({ title: `주문 ${list.length}건이 품절이에요`, body: `${lines(list, (o) => o.item_name)}\n${why}\n다른 품목이 필요하면 다시 주문해 주세요.` }),
  );
}

/** 관리자가 주문을 바꿨어요 — 바뀐 내용 + 이유 */
export function editNotificationBody(changes: string[], reason: string): string {
  const what = changes.length > 0 ? changes.join("\n") : "주문 정보가 수정되었습니다.";
  return reason.trim() ? `${what}\n사유: ${reason.trim()}` : what;
}

/** 수량이나 품목이 바뀌었는가 — 이때는 이유를 꼭 받는다 */
export function needsChangeReason(prev: { item_name: string; quantity: number; unit: string }, next: { item_name: string; quantity: number; unit: string }): boolean {
  return prev.item_name.trim() !== next.item_name.trim() || prev.quantity !== next.quantity || (prev.unit ?? "").trim() !== (next.unit ?? "").trim();
}

/** 코멘트 미리보기 — 알림 본문에 넣을 앞부분 */
export function commentPreview(body: string, max = 80): string {
  const one = body.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

/**
 * 주문 코멘트 알림.
 * - 관리자가 썼으면 → 주문 등록한 사람에게
 * - 주문자가 답글을 썼으면 → 그 주문에 코멘트를 남긴 관리자들에게
 * 쓴 사람 본인에게는 보내지 않는다. 알림은 그 주문 화면(코멘트가 있는 곳)으로 이어진다.
 */
export function commentNotifications(input: {
  orderId: string;
  itemName: string;
  requesterId: string | null;
  authorId: string;
  authorName: string;
  authorIsAdmin: boolean;
  /** 이 주문에 코멘트를 남긴 관리자들 (답글 알림 받을 사람) */
  adminAuthorIds: string[];
  body: string;
}): NotificationRow[] {
  const preview = commentPreview(input.body);
  const link = `/orders/${input.orderId}`;
  if (input.authorIsAdmin) {
    if (!input.requesterId || input.requesterId === input.authorId) return [];
    return [{
      user_id: input.requesterId,
      order_id: input.orderId,
      type: "order_comment",
      title: `'${input.itemName}' 주문에 코멘트가 달렸어요`,
      body: `${input.authorName}: ${preview}`,
      link,
    }];
  }
  const to = [...new Set(input.adminAuthorIds)].filter((id) => id && id !== input.authorId);
  return to.map((user_id) => ({
    user_id,
    order_id: input.orderId,
    type: "order_comment_reply",
    title: `'${input.itemName}' 코멘트에 답글이 달렸어요`,
    body: `${input.authorName}: ${preview}`,
    link,
  }));
}

/**
 * 주문이 삭제됐어요 — 사유와 어떤 주문이었는지를 함께 보낸다.
 * 주문은 지워지므로 order_id 를 넣지 않는다(넣으면 알림도 함께 지워진다). 링크도 없다 — 본문이 전부다.
 */
export function deleteNotifications(
  orders: (NotifyOrder & { quantity?: number | null; unit?: string | null; created_at?: string | null })[],
  actorId: string,
  actorName: string,
  reason: string,
): NotificationRow[] {
  const qty = (o: { quantity?: number | null; unit?: string | null }) => (o.quantity && o.quantity > 0 ? ` ${o.quantity}${o.unit ? ` ${o.unit}` : ""}` : "");
  const day = (o: { created_at?: string | null }) => {
    if (!o.created_at) return "";
    const d = new Date(new Date(o.created_at).getTime() + 9 * 3600_000); // KST
    return ` (${d.getUTCMonth() + 1}/${d.getUTCDate()} 주문)`;
  };
  const why = reason.trim() ? `사유: ${reason.trim()}` : "사유는 적혀 있지 않아요.";
  const who = actorName.trim() ? `삭제한 사람: ${actorName.trim()}` : "";
  const rows: NotificationRow[] = [];
  for (const [userId, list] of byRequester(orders, actorId)) {
    const title = list.length === 1 ? `'${list[0].item_name}' 주문이 삭제됐어요` : `주문 ${list.length}건이 삭제됐어요`;
    const body = [lines(list, (o) => `${o.item_name}${qty(o)}${day(o)}`), why, who, "필요하면 다시 주문해 주세요."].filter(Boolean).join("\n");
    rows.push({ user_id: userId, order_id: null, type: "order_deleted", title, body, link: null });
  }
  return rows;
}
