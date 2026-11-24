"use server";

import { requireAdmin, requireUser } from "@/lib/supabase/server";
import {
  arrivalNotifications,
  dispatchNotifications,
  outOfStockNotifications,
  partialNotifications,
  type NotificationRow,
} from "@/lib/utils/order-notify";

type Db = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

/**
 * 주문자에게 알림을 보낸다.
 * 본 작업(발주·검수·품절)은 이미 끝난 뒤라서, 알림 저장이 실패해도 오류를 던지지 않는다.
 * 문구와 묶는 규칙은 lib/utils/order-notify.ts.
 */
async function sendNotifications(supabase: Db, rows: NotificationRow[]) {
  if (rows.length === 0) return;
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) console.error("[notify] 알림 저장 실패:", error.message);
}

/** 수정한 주문에서 알림에 필요한 칸만 돌려받는다 */
const NOTIFY_COLUMNS = "id, requester_id, item_name, vendor_name, quantity, unit";
interface NotifyRow {
  id: string;
  requester_id: string | null;
  item_name: string;
  vendor_name: string | null;
  quantity: number | null;
  unit: string | null;
}

/** 칸이 아직 없는 경우 (supabase/migrate-order-reasons.sql 미실행) */
const isMissingColumn = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42703" || e.code === "PGRST204" || /column .* does not exist|could not find the .* column/i.test(e.message ?? ""));

/** 개별 발주 (status → ordered) */
export async function dispatchOrder(
  orderId: string,
  vendorName: string,
  orderNotes: string,
) {
  const { supabase, userId } = await requireAdmin();

  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "ordered",
      updated_by: userId,
      vendor_name: vendorName,
      order_notes: orderNotes.trim(),
      dispatched_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .select(NOTIFY_COLUMNS)
    .single();

  if (error) throw new Error("발주 처리에 실패했습니다.");
  await sendNotifications(supabase, dispatchNotifications([data as NotifyRow], userId));
}

/** 일괄 발주 — 동일 업체 */
export async function bulkDispatchAll(
  orderIds: string[],
  vendorName: string,
  orderNotes: string,
) {
  const { supabase, userId } = await requireAdmin();

  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "ordered",
      vendor_name: vendorName.trim(),
      order_notes: orderNotes.trim(),
      updated_by: userId,
      dispatched_at: new Date().toISOString(),
    })
    .in("id", orderIds)
    .select(NOTIFY_COLUMNS);

  if (error) throw new Error("일괄 발주 처리에 실패했습니다.");
  await sendNotifications(supabase, dispatchNotifications((data ?? []) as NotifyRow[], userId));
}

/** 일괄 발주 — 개별 업체 */
export async function bulkDispatchIndividual(
  items: { id: string; vendorName: string; orderNotes: string }[],
) {
  const { supabase, userId } = await requireAdmin();

  const dispatchedAt = new Date().toISOString();
  const results = await Promise.all(
    items.map((item) =>
      supabase
        .from("orders")
        .update({
          status: "ordered",
          vendor_name: item.vendorName.trim(),
          order_notes: item.orderNotes.trim(),
          updated_by: userId,
          dispatched_at: dispatchedAt,
        })
        .eq("id", item.id)
        .select(NOTIFY_COLUMNS)
        .single(),
    ),
  );

  // 일부가 실패해도 성공한 건의 주문자에게는 알린다
  const done = results.filter((r) => !r.error && r.data).map((r) => r.data as NotifyRow);
  await sendNotifications(supabase, dispatchNotifications(done, userId));

  if (results.some((r) => r.error)) throw new Error("일부 발주 처리에 실패했습니다.");
}

/** 개별 검수 완료 (status → inspecting) */
export async function inspectOrder(
  orderId: string,
  confirmedQuantity: number,
  invoiceReceived: boolean,
  inspectionNotes: string,
) {
  const { supabase, userId } = await requireAdmin();

  const trimmedNotes = inspectionNotes.trim();

  const { data: updated, error } = await supabase
    .from("orders")
    .update({
      status: "inspecting",
      confirmed_quantity: confirmedQuantity,
      invoice_received: invoiceReceived,
      inspection_notes: trimmedNotes,
      inspection_memo: null,
      inspected_by: userId,
      inspected_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .select(NOTIFY_COLUMNS)
    .single();

  if (error) throw new Error("검수 처리에 실패했습니다.");

  // 들어온 것은 항상 알린다 (예전에는 검수 비고가 있을 때만 알렸다)
  const row = updated as NotifyRow;
  await sendNotifications(supabase, arrivalNotifications([{ ...row, quantity: confirmedQuantity, note: trimmedNotes }], userId));
}

/** 일괄 검수 완료 */
export async function bulkInspectOrders(
  items: {
    id: string;
    confirmedQuantity: number;
    invoiceReceived: boolean;
    inspectionNotes: string;
  }[],
) {
  const { supabase, userId } = await requireAdmin();

  const now = new Date().toISOString();

  const results = await Promise.all(
    items.map((item) =>
      supabase
        .from("orders")
        .update({
          status: "inspecting",
          confirmed_quantity: item.confirmedQuantity,
          invoice_received: item.invoiceReceived,
          inspection_notes: item.inspectionNotes.trim(),
          inspection_memo: null,
          inspected_by: userId,
          inspected_at: now,
        })
        .eq("id", item.id)
        .select(NOTIFY_COLUMNS)
        .single(),
    ),
  );

  // 주문자마다 한 통으로 묶어 알린다 (일부가 실패해도 성공한 건은 알린다)
  const arrived = results
    .map((r, i) => ({ r, item: items[i] }))
    .filter(({ r }) => !r.error && r.data)
    .map(({ r, item }) => ({ ...(r.data as NotifyRow), quantity: item.confirmedQuantity, note: item.inspectionNotes.trim() }));
  await sendNotifications(supabase, arrivalNotifications(arrived, userId));

  if (results.some((r) => r.error)) throw new Error("일부 검수 처리에 실패했습니다.");
}

/**
 * 받은 수량 기록 (검수 화면에서 수량 칸을 고쳤을 때).
 * 명세서 확정(invoice-confirm-action)과 같은 규칙: 받은 수량 합이 주문 수량보다 적으면 부분입고로 남기고(status 그대로),
 * 다 받으면 검수완료(inspecting). receivedTotal은 지금까지 받은 "총" 수량.
 */
export async function recordReceivedQuantity(orderId: string, receivedTotal: number, inspectionNotes = "") {
  const { supabase, userId } = await requireAdmin();
  if (!Number.isFinite(receivedTotal) || receivedTotal < 0) throw new Error("받은 수량이 올바르지 않습니다.");

  const { data: order, error: readErr } = await supabase
    .from("orders")
    .select("quantity, unit, status, requester_id, item_name, received_quantity")
    .eq("id", orderId)
    .single();
  if (readErr || !order) throw new Error("주문을 찾을 수 없습니다.");
  if (order.status !== "ordered") throw new Error("검수대기 상태가 아닙니다.");

  const received = Math.floor(receivedTotal);
  const trimmedNotes = inspectionNotes.trim();
  const base = { id: orderId, requester_id: order.requester_id as string | null, item_name: order.item_name as string, unit: order.unit as string | null };

  if (order.quantity > 0 && received < order.quantity) {
    const { error } = await supabase
      .from("orders")
      .update({ received_quantity: received, updated_by: userId })
      .eq("id", orderId);
    if (error) throw new Error("받은 수량 저장에 실패했습니다.");
    // 더 들어왔을 때만 알린다 (숫자를 줄여 고친 경우는 알리지 않는다)
    if (received > (order.received_quantity ?? 0)) {
      await sendNotifications(supabase, partialNotifications([{ ...base, received, quantity: order.quantity }], userId));
    }
    return { completed: false };
  }

  const { error } = await supabase
    .from("orders")
    .update({
      status: "inspecting",
      confirmed_quantity: received,
      received_quantity: received,
      invoice_received: true,
      inspection_notes: trimmedNotes,
      inspection_memo: null,
      inspected_by: userId,
      inspected_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", orderId);
  if (error) throw new Error("검수 처리에 실패했습니다.");

  await sendNotifications(supabase, arrivalNotifications([{ ...base, quantity: received, note: trimmedNotes }], userId));
  return { completed: true };
}

/**
 * 품절 처리 (status → out_of_stock).
 * 사유는 품절 사유 칸(out_of_stock_reason)에 넣는다 — 예전처럼 발주 비고(order_notes)를 덮어쓰지 않는다.
 * 주문자에게 사유와 함께 알린다. 한 건이든 여러 건이든 같은 함수.
 */
async function markOutOfStockMany(orderIds: string[], reason: string) {
  const { supabase, userId } = await requireAdmin();
  if (orderIds.length === 0) return;
  const trimmed = reason.trim();
  const RETURNING = "id, requester_id, item_name";

  let res = await supabase
    .from("orders")
    .update({
      status: "out_of_stock",
      out_of_stock_reason: trimmed || null,
      out_of_stock_at: new Date().toISOString(),
      out_of_stock_ack_at: null,
    })
    .in("id", orderIds)
    .select(RETURNING);

  if (res.error && isMissingColumn(res.error)) {
    // 품절 사유 칸이 아직 없다 → 예전 방식(사유가 있을 때만 발주 비고에 적는다)
    res = await supabase
      .from("orders")
      .update(trimmed ? { status: "out_of_stock", order_notes: trimmed } : { status: "out_of_stock" })
      .in("id", orderIds)
      .select(RETURNING);
  }
  if (res.error) throw new Error("품절 처리에 실패했습니다.");

  await sendNotifications(supabase, outOfStockNotifications((res.data ?? []) as { id: string; requester_id: string | null; item_name: string }[], userId, trimmed));
}

/** 품절 처리 */
export async function markOutOfStock(orderId: string, reason: string) {
  await markOutOfStockMany([orderId], reason);
}

/** 일괄 품절 처리 — 사유는 고른 주문 모두에 똑같이 적힌다 */
export async function bulkMarkOutOfStock(orderIds: string[], reason = "") {
  await markOutOfStockMany(orderIds, reason);
}

/** 주문 취소 — 주문신청으로 되돌리기 */
export async function revertOrderToPending(orderId: string) {
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("orders")
    .update({ status: "pending" })
    .eq("id", orderId);

  if (error) throw new Error("주문 취소에 실패했습니다.");
}

// 주문 삭제는 lib/actions/order-delete-action.ts 의 deleteOrdersWithReason 하나로만 한다 (사유·주문자 알림)

/** 반품 접수 (status: return_requested → return_pending) */
export async function dispatchReturn(orderId: string) {
  const { supabase, userId } = await requireAdmin();

  const { error } = await supabase
    .from("orders")
    .update({ status: "return_pending", updated_by: userId })
    .eq("id", orderId)
    .eq("status", "return_requested");

  if (error) throw new Error("반품 접수 처리에 실패했습니다.");
}

/** 일괄 반품 접수 */
export async function bulkDispatchReturn(orderIds: string[]) {
  const { supabase, userId } = await requireAdmin();

  const results = await Promise.all(
    orderIds.map((id) =>
      supabase
        .from("orders")
        .update({ status: "return_pending", updated_by: userId })
        .eq("id", id)
        .eq("status", "return_requested"),
    ),
  );

  if (results.some((r) => r.error)) throw new Error("일부 반품 접수 처리에 실패했습니다.");
}

/** 반품 완료 (status: return_pending → return_completed) */
export async function completeReturn(orderId: string) {
  const { supabase, userId } = await requireAdmin();

  const { error } = await supabase
    .from("orders")
    .update({ status: "return_completed", updated_by: userId })
    .eq("id", orderId)
    .eq("status", "return_pending");

  if (error) throw new Error("반품 완료 처리에 실패했습니다.");
}

/** 일괄 반품 완료 */
export async function bulkCompleteReturn(orderIds: string[]) {
  const { supabase, userId } = await requireAdmin();

  const results = await Promise.all(
    orderIds.map((id) =>
      supabase
        .from("orders")
        .update({ status: "return_completed", updated_by: userId })
        .eq("id", id)
        .eq("status", "return_pending"),
    ),
  );

  if (results.some((r) => r.error)) throw new Error("일부 반품 완료 처리에 실패했습니다.");
}

/** 관리자 직접 반품 신청 — 새 레코드 INSERT */
export async function adminCreateDirectReturn(
  orderId: string,
  itemName: string,
  quantity: number,
  unit: string,
  returnReason: string,
  returnPhotoUrls: string[],
) {
  const { supabase, userId } = await requireAdmin();

  const now = new Date().toISOString();

  const { error } = await supabase.from("orders").insert({
    id: orderId,
    type: "return",
    status: "return_requested",
    item_name: itemName.trim(),
    quantity,
    unit: unit.trim(),
    requester_id: userId,
    return_quantity: quantity,
    return_reason: returnReason.trim() || null,
    return_requested_by: userId,
    return_requested_at: now,
    return_photo_urls: returnPhotoUrls,
    vendor_name: "",
    notes: "",
    order_notes: "",
    inspection_notes: "",
  });

  if (error) throw new Error("반품 신청에 실패했습니다.");
}

/** 관리자 직접 품절 등록 — 새 레코드 INSERT */
export async function adminCreateDirectOutOfStock(
  orderId: string,
  itemName: string,
  quantity: number,
  unit: string,
  reason: string,
  photoUrls: string[],
) {
  const { supabase, userId } = await requireAdmin();

  const { error } = await supabase.from("orders").insert({
    id: orderId,
    type: "order",
    status: "out_of_stock",
    item_name: itemName.trim(),
    quantity,
    unit: unit.trim(),
    requester_id: userId,
    photo_urls: photoUrls,
    vendor_name: "",
    notes: "",
    order_notes: reason.trim() || null,
    inspection_notes: "",
  });

  if (error) throw new Error("품절 등록에 실패했습니다.");
}

/** 검수 메모 저장 */
export async function updateInspectionMemo(orderId: string, memo: string) {
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("orders")
    .update({ inspection_memo: memo || null })
    .eq("id", orderId);

  if (error) throw new Error("메모 저장에 실패했습니다.");
}

/** 혈액 기록 확인 (status → confirmed) */
export async function confirmBloodRecord(
  recordId: string,
  settlementType: string,
) {
  const { supabase, userId } = await requireAdmin();

  const { error } = await supabase
    .from("blood_records")
    .update({
      status: "confirmed",
      settlement_type: settlementType,
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", recordId);

  if (error) throw new Error("확인 처리에 실패했습니다.");
}
