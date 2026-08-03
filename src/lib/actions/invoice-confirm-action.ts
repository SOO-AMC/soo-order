"use server";

import { requireAdmin } from "@/lib/supabase/server";
import type { ConfirmInvoicePayload } from "@/lib/types/invoice";

/**
 * 미리보기에서 확정된 명세서를 처리한다. 관리자 전용.
 * - 배분된 주문: 배분 수량으로 완전입고 → 검수완료(inspecting), 부분입고 → received_quantity 누적
 * - 잔여 수량: inspect(검수완료 신규) / return(반품 신규) / ledger(원장만)
 * - 단가 불일치 갱신, 신규 품목 추가
 * - invoices / invoice_items 기록(거래처원장 원천)
 */
export async function confirmInvoice(payload: ConfirmInvoicePayload): Promise<void> {
  const { supabase, userId } = await requireAdmin();
  const now = new Date().toISOString();

  // 미등록 업체면 자동 등록 (가격비교엔 숨김, 거래처원장/검색엔 노출)
  let vendorId = payload.vendorId;
  const vName = payload.vendorName.trim();
  if (!vendorId && vName) {
    const { data: existing } = await supabase.from("vendors").select("id").eq("name", vName).maybeSingle();
    if (existing) {
      vendorId = existing.id;
    } else {
      const { data: created } = await supabase
        .from("vendors")
        .insert({ name: vName, discount_rate: 0, show_in_compare: false })
        .select("id")
        .single();
      vendorId = created?.id ?? null;
    }
  }

  // 배분 대상 기존 주문 정보 선조회
  const allocIds = payload.rows.flatMap((r) => r.allocations.map((a) => a.orderId));
  const ordersById = new Map<string, { quantity: number; received_quantity: number }>();
  if (allocIds.length > 0) {
    const { data } = await supabase
      .from("orders")
      .select("id, quantity, received_quantity")
      .in("id", allocIds);
    for (const o of (data ?? []) as { id: string; quantity: number; received_quantity: number }[]) {
      ordersById.set(o.id, { quantity: o.quantity, received_quantity: o.received_quantity ?? 0 });
    }
  }

  const createInspectOrder = async (itemName: string, qty: number) => {
    const { data } = await supabase
      .from("orders")
      .insert({
        type: "order", status: "inspecting", item_name: itemName, quantity: qty, unit: "",
        requester_id: userId, vendor_name: payload.vendorName,
        confirmed_quantity: qty, received_quantity: qty, invoice_received: true,
        inspected_by: userId, inspected_at: now,
        notes: "", order_notes: "", inspection_notes: "",
      })
      .select("id")
      .single();
    return data?.id ?? null;
  };

  const createReturnOrder = async (itemName: string, qty: number) => {
    const { data } = await supabase
      .from("orders")
      .insert({
        type: "return", status: "return_requested", item_name: itemName, quantity: qty, unit: "",
        requester_id: userId, vendor_name: payload.vendorName,
        return_quantity: qty, return_reason: "명세서에 있으나 주문 내역 없음(오류건)",
        return_requested_by: userId, return_requested_at: now,
        notes: "", order_notes: "", inspection_notes: "",
      })
      .select("id")
      .single();
    return data?.id ?? null;
  };

  // 라인별 처리 → invoice_items 대표 matched_order_id 확정
  const finalOrderIds: (string | null)[] = [];
  for (const row of payload.rows) {
    let representativeOrderId: string | null = null;

    // 1) 주문별 배분 적용
    for (const alloc of row.allocations) {
      if (alloc.quantity <= 0) continue;
      representativeOrderId ??= alloc.orderId;
      const o = ordersById.get(alloc.orderId);
      if (!o) continue;
      const newReceived = o.received_quantity + alloc.quantity;
      o.received_quantity = newReceived; // 같은 주문이 여러 라인에 걸쳐도 누적 반영
      if (o.quantity > 0 && newReceived < o.quantity) {
        await supabase
          .from("orders")
          .update({ received_quantity: newReceived, invoice_received: true, updated_by: userId })
          .eq("id", alloc.orderId);
      } else {
        await supabase
          .from("orders")
          .update({
            status: "inspecting",
            confirmed_quantity: newReceived,
            received_quantity: newReceived,
            invoice_received: true,
            inspected_by: userId,
            inspected_at: now,
            updated_by: userId,
          })
          .eq("id", alloc.orderId);
      }
    }

    // 2) 잔여 수량 처리
    const allocated = row.allocations.reduce((s, a) => s + Math.max(0, a.quantity), 0);
    const leftover = row.quantity - allocated;
    if (leftover > 0 && row.leftoverAction === "inspect") {
      const id = await createInspectOrder(row.itemName, leftover);
      representativeOrderId ??= id;
    } else if (leftover > 0 && row.leftoverAction === "return") {
      const id = await createReturnOrder(row.itemName, leftover);
      representativeOrderId ??= id;
    }
    // leftoverAction === "ledger" (또는 잔여 0) → 추가 처리 없음

    finalOrderIds.push(representativeOrderId);
  }

  // 단가 불일치 갱신
  for (const row of payload.rows) {
    if (row.updatePrice && row.vendorProductId) {
      await supabase.from("vendor_products").update({ unit_price: row.unitPrice }).eq("id", row.vendorProductId);
    }
  }

  // 신규 품목 추가 (업체 단가표에만, 통합제품 미매핑)
  for (const row of payload.rows) {
    if (row.isNewProduct && vendorId) {
      await supabase.from("vendor_products").insert({
        vendor_id: vendorId,
        product_name: row.itemName,
        unit_price: row.unitPrice,
        manufacturer: "",
        spec: "",
        ingredient: "",
        category: "",
        unified_product_id: null,
      });
    }
  }

  // 명세서 헤더 기록
  const total = payload.rows.reduce((s, r) => s + r.amount, 0);
  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .insert({
      vendor_id: vendorId,
      vendor_name: payload.vendorName,
      invoice_date: payload.invoiceDate,
      image_urls: payload.imagePath ? [payload.imagePath] : [],
      page_start: payload.pageStart ?? null,
      page_end: payload.pageEnd ?? null,
      total_amount: total,
      created_by: userId,
    })
    .select("id")
    .single();
  if (invErr || !inv) throw new Error(`명세서 기록에 실패했습니다.${invErr ? ` (${invErr.message})` : ""}`);

  // 명세서 라인 기록 (거래처원장 원천)
  const itemsToInsert = payload.rows.map((r, i) => ({
    invoice_id: inv.id,
    item_name: r.itemName,
    quantity: r.quantity,
    list_price: r.listPrice,
    unit_price: r.unitPrice,
    amount: r.amount,
    matched_order_id: finalOrderIds[i],
    unified_product_id: r.unifiedProductId,
    is_new_product: r.isNewProduct,
  }));
  const { error: itemsErr } = await supabase.from("invoice_items").insert(itemsToInsert);
  if (itemsErr) throw new Error(`명세서 라인 기록에 실패했습니다. (${itemsErr.message})`);
}
