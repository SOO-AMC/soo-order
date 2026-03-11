"use server";

import { requireAdmin } from "@/lib/supabase/server";

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

/** 반품 완료 (status → return_completed) */
export async function completeReturn(orderId: string) {
  const { supabase, userId } = await requireAdmin();

  const { error } = await supabase
    .from("orders")
    .update({ status: "return_completed", updated_by: userId })
    .eq("id", orderId);

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
        .eq("id", id),
    ),
  );

  if (results.some((r) => r.error)) throw new Error("일부 반품 완료 처리에 실패했습니다.");
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
