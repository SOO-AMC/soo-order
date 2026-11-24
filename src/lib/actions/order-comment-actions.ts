"use server";

import { requireUser } from "@/lib/supabase/server";
import { chunk } from "@/lib/supabase/paginate";
import { logActivity } from "@/lib/utils/activity-log";
import { commentNotifications } from "@/lib/utils/order-notify";
import { COMMENT_MAX, type CommentMark, type OrderComment } from "@/lib/types/order-comment";

/**
 * 주문 코멘트. 관리자가 주문 한 건에 코멘트를 남기면 주문 등록한 사람이 앱에서 보고 답글을 단다.
 * 누가 무엇을 읽고 쓸 수 있는지는 RLS(supabase/migrate-order-comments.sql)가 정한다 — 여기서는 본인 클라이언트로만 읽고 쓴다.
 */

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const NOT_READY = "코멘트 기능을 켜려면 Supabase 에서 supabase/migrate-order-comments.sql 을 먼저 실행해 주세요.";
const isMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST205" || e.code === "PGRST202" || e.code === "42P01" || e.code === "42883" || /could not find|does not exist/i.test(e.message ?? ""));

const SELECT = "id, order_id, author_id, body, created_at, read_at, author:profiles!author_id(full_name)";
type Row = {
  id: string;
  order_id: string;
  author_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  author: { full_name: string | null } | { full_name: string | null }[] | null;
};

function toComment(r: Row, requesterId: string | null): OrderComment {
  const a = Array.isArray(r.author) ? r.author[0] : r.author;
  return {
    id: r.id,
    orderId: r.order_id,
    authorId: r.author_id,
    authorName: a?.full_name ?? "알 수 없음",
    // 관리자와 주문자만 쓸 수 있으므로, 주문자가 아니면 관리자 코멘트다
    byAdmin: r.author_id !== requesterId,
    body: r.body,
    createdAt: r.created_at,
    readAt: r.read_at,
  };
}

/** 이 주문의 코멘트 (오래된 것부터) */
export async function fetchOrderComments(orderId: string): Promise<{ ready: boolean; comments: OrderComment[] }> {
  const { supabase } = await requireUser();
  const [{ data: order }, res] = await Promise.all([
    supabase.from("orders").select("requester_id").eq("id", orderId).maybeSingle(),
    supabase.from("order_comments").select(SELECT).eq("order_id", orderId).order("created_at"),
  ]);
  if (res.error) {
    if (isMissing(res.error)) return { ready: false, comments: [] };
    throw new Error(`코멘트를 불러오지 못했어요: ${res.error.message}`);
  }
  const requesterId = (order?.requester_id as string | null) ?? null;
  return { ready: true, comments: ((res.data ?? []) as unknown as Row[]).map((r) => toComment(r, requesterId)) };
}

/** 코멘트 남기기 — 관리자는 아무 주문에나, 주문자는 관리자가 코멘트를 단 자기 주문에 답글로 */
export async function addOrderComment(orderId: string, body: string): Promise<Result<OrderComment>> {
  const { supabase, userId } = await requireUser();
  const text = body.trim();
  if (!text) return { ok: false, error: "코멘트를 적어 주세요." };
  if (text.length > COMMENT_MAX) return { ok: false, error: `코멘트는 ${COMMENT_MAX}자까지 적을 수 있어요.` };

  const [{ data: me }, { data: order }] = await Promise.all([
    supabase.from("profiles").select("role, full_name").eq("id", userId).single(),
    supabase.from("orders").select("id, requester_id, item_name").eq("id", orderId).maybeSingle(),
  ]);
  if (!order) return { ok: false, error: "주문을 찾을 수 없어요. 이미 삭제됐을 수 있어요." };
  const isAdmin = me?.role === "admin";
  const requesterId = (order.requester_id as string | null) ?? null;
  if (!isAdmin && requesterId !== userId) return { ok: false, error: "이 주문에는 코멘트를 남길 수 없어요." };

  const { data, error } = await supabase
    .from("order_comments")
    .insert({ order_id: orderId, author_id: userId, body: text })
    .select(SELECT)
    .single();
  if (error || !data) {
    if (isMissing(error)) return { ok: false, error: NOT_READY };
    if (error?.code === "42501") return { ok: false, error: "관리자가 코멘트를 남긴 주문에만 답글을 달 수 있어요." };
    return { ok: false, error: `코멘트를 남기지 못했어요: ${error?.message ?? ""}` };
  }
  const row = data as unknown as Row;

  // 알림: 관리자 코멘트 → 주문자, 주문자 답글 → 이 주문에 코멘트를 남긴 관리자들
  let adminAuthorIds: string[] = [];
  if (!isAdmin) {
    const { data: authors } = await supabase.from("order_comments").select("author_id").eq("order_id", orderId).neq("author_id", userId);
    adminAuthorIds = (authors ?? []).map((a) => a.author_id as string);
  }
  const rows = commentNotifications({
    orderId,
    itemName: order.item_name as string,
    requesterId,
    authorId: userId,
    authorName: me?.full_name ?? "",
    authorIsAdmin: isAdmin,
    adminAuthorIds,
    body: text,
  });
  if (rows.length) {
    const { error: nErr } = await supabase.from("notifications").insert(rows);
    if (nErr) console.error("[comment] 알림 저장 실패:", nErr.message);
  }

  void logActivity({
    userId,
    userName: me?.full_name ?? "알 수 없음",
    category: "order",
    action: isAdmin ? "order_comment" : "order_comment_reply",
    description: `'${order.item_name}' ${isAdmin ? "코멘트" : "답글"}: ${text.slice(0, 60)}`,
    metadata: { orderId, commentId: row.id },
  });

  return { ok: true, data: toComment(row, requesterId) };
}

/** 이 주문에서 내가 받은 코멘트를 읽음으로 — 관련 알림도 함께 읽음 */
export async function markOrderCommentsRead(orderId: string): Promise<number> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase.rpc("mark_order_comments_read", { p_order: orderId });
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("order_id", orderId)
    .in("type", ["order_comment", "order_comment_reply"])
    .eq("is_read", false);
  if (error) return 0;
  return Number(data) || 0;
}

/** 목록용 표시: 주문마다 코멘트 수와 안 읽은 상태. 표가 없으면 빈 값 */
export async function fetchCommentMarks(orders: { id: string; requester_id: string | null }[]): Promise<Record<string, CommentMark>> {
  const { supabase } = await requireUser();
  const requesterOf = new Map(orders.map((o) => [o.id, o.requester_id] as const));
  const out: Record<string, CommentMark> = {};
  for (const ids of chunk([...requesterOf.keys()], 100)) {
    const { data, error } = await supabase.from("order_comments").select("order_id, author_id, read_at").in("order_id", ids);
    if (error) return out;
    for (const r of data ?? []) {
      const id = r.order_id as string;
      const m = (out[id] ??= { count: 0, unreadByRequester: false, newReply: false });
      m.count += 1;
      if (r.read_at) continue;
      if (r.author_id === requesterOf.get(id)) m.newReply = true;
      else m.unreadByRequester = true;
    }
  }
  return out;
}
