"use server";

import { requireAdmin, requireUser } from "@/lib/supabase/server";

/** 개별 발주 (status → ordered) */
export async function dispatchOrder(
  orderId: string,
  vendorName: string,
  orderNotes: string,
) {
  const { supabase, userId } = await requireAdmin();

  const { error } = await supabase
    .from("orders")
    .update({
      status: "ordered",
      updated_by: userId,
      vendor_name: vendorName,
      order_notes: orderNotes.trim(),
    })
    .eq("id", orderId);

  if (error) throw new Error("발주 처리에 실패했습니다.");
}

/** 일괄 발주 — 동일 업체 */
export async function bulkDispatchAll(
  orderIds: string[],
  vendorName: string,
  orderNotes: string,
) {
  const { supabase, userId } = await requireAdmin();

  const { error } = await supabase
    .from("orders")
    .update({
      status: "ordered",
      vendor_name: vendorName.trim(),
      order_notes: orderNotes.trim(),
      updated_by: userId,
    })
    .in("id", orderIds);

  if (error) throw new Error("일괄 발주 처리에 실패했습니다.");
}

/** 일괄 발주 — 개별 업체 */
export async function bulkDispatchIndividual(
  items: { id: string; vendorName: string; orderNotes: string }[],
) {
  const { supabase, userId } = await requireAdmin();

  const results = await Promise.all(
    items.map((item) =>
      supabase
        .from("orders")
        .update({
          status: "ordered",
          vendor_name: item.vendorName.trim(),
          order_notes: item.orderNotes.trim(),
          updated_by: userId,
        })
        .eq("id", item.id),
    ),
  );

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

  const { error } = await supabase
    .from("orders")
    .update({
      status: "inspecting",
      confirmed_quantity: confirmedQuantity,
      invoice_received: invoiceReceived,
      inspection_notes: inspectionNotes.trim(),
      inspection_memo: null,
      inspected_by: userId,
      inspected_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (error) throw new Error("검수 처리에 실패했습니다.");
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
        .eq("id", item.id),
    ),
  );

  if (results.some((r) => r.error)) throw new Error("일부 검수 처리에 실패했습니다.");
}

/** 품절 처리 (status → out_of_stock) */
export async function markOutOfStock(orderId: string, reason: string) {
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("orders")
    .update({
      status: "out_of_stock",
      order_notes: reason.trim() || null,
    })
    .eq("id", orderId);

  if (error) throw new Error("품절 처리에 실패했습니다.");
}

/** 일괄 품절 처리 */
export async function bulkMarkOutOfStock(orderIds: string[]) {
  const { supabase } = await requireAdmin();

  const results = await Promise.all(
    orderIds.map((id) =>
      supabase
        .from("orders")
        .update({ status: "out_of_stock" })
        .eq("id", id),
    ),
  );

  if (results.some((r) => r.error)) throw new Error("일부 품절 처리에 실패했습니다.");
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

/** 주문 삭제 */
export async function deleteOrder(orderId: string) {
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("orders")
    .delete()
    .eq("id", orderId);

  if (error) throw new Error("주문 삭제에 실패했습니다.");
}

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
