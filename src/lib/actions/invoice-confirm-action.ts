"use server";

import { requireAdmin } from "@/lib/supabase/server";
import { buildVendorIndex, looksLikeOwnHospital, vendorKey } from "@/lib/utils/vendor-name";
import { arrivalNotifications, partialNotifications } from "@/lib/utils/order-notify";
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

  // ── 업체 정하기 ──
  // vName = 명세서에 찍힌 글자(OCR). 주문에는 이 글자가 아니라 업체의 표준 이름을 넣는다.
  let vendorId = payload.vendorId;
  const vName = payload.vendorName.trim();
  const ownHospital = looksLikeOwnHospital(vName); // 공급받는자(우리 병원)를 업체로 읽은 경우
  let canonicalName = "";

  const [vendorsRes, aliasRes] = await Promise.all([
    supabase.from("vendors").select("id, name"),
    supabase.from("vendor_aliases").select("vendor_id, alias"), // 표가 아직 없으면 error → 빈 목록으로 둔다
  ]);
  const vendorList = (vendorsRes.data ?? []) as { id: string; name: string }[];
  const index = buildVendorIndex(
    vendorList,
    ((aliasRes.data ?? []) as { vendor_id: string; alias: string }[]).map((a) => ({ vendorId: a.vendor_id, alias: a.alias })),
  );

  if (vendorId) {
    canonicalName = vendorList.find((v) => v.id === vendorId)?.name ?? "";
    // 관리자가 고른 업체와 명세서 글자가 다르면 "다른 이름"으로 기억 → 다음 명세서부터 바로 맞는다.
    // 우리 병원 이름은 기억하지 않는다(어느 업체 명세서에서든 나올 수 있다).
    if (canonicalName && vName && !ownHospital && vendorKey(vName) && !index.resolve(vName)) {
      await supabase.from("vendor_aliases").insert({ vendor_id: vendorId, alias: vName });
    }
  } else if (vName) {
    // 표기만 다른 이름·다른 이름으로 이미 있는 업체인지 먼저 본다 (같은 업체가 또 등록되지 않게)
    const known = index.resolve(vName);
    if (known) {
      vendorId = known.id;
      canonicalName = known.name;
    } else if (!ownHospital) {
      // 처음 보는 업체 → 자동 등록 (가격비교엔 숨김, 거래처원장/검색엔 노출)
      const { data: created } = await supabase
        .from("vendors")
        .insert({ name: vName, discount_rate: 0, show_in_compare: false })
        .select("id")
        .single();
      vendorId = created?.id ?? null;
      canonicalName = vendorId ? vName : "";
    }
    // 우리 병원 이름인데 업체를 고르지 않았으면 업체 없이 기록한다 (우리 병원이 업체로 등록되지 않게)
  }
  /** 이 명세서로 만들어지는 주문에 넣을 업체 이름 */
  const orderVendorName = canonicalName || (ownHospital ? "" : vName);

  // 배분 대상 기존 주문 정보 선조회
  const allocIds = payload.rows.flatMap((r) => r.allocations.map((a) => a.orderId));
  interface AllocOrder {
    quantity: number;
    received_quantity: number;
    requester_id: string | null;
    item_name: string;
    unit: string | null;
  }
  const ordersById = new Map<string, AllocOrder>();
  /** 이 명세서로 받은 수량이 기록된 주문 (주문자에게 알릴 대상) */
  const touchedOrderIds = new Set<string>();
  if (allocIds.length > 0) {
    const { data } = await supabase
      .from("orders")
      .select("id, quantity, received_quantity, requester_id, item_name, unit")
      .in("id", allocIds);
    for (const o of (data ?? []) as ({ id: string } & AllocOrder)[]) {
      ordersById.set(o.id, { quantity: o.quantity, received_quantity: o.received_quantity ?? 0, requester_id: o.requester_id, item_name: o.item_name, unit: o.unit });
    }
  }

  const createInspectOrder = async (itemName: string, qty: number) => {
    const { data } = await supabase
      .from("orders")
      .insert({
        type: "order", status: "inspecting", item_name: itemName, quantity: qty, unit: "",
        requester_id: userId, vendor_name: orderVendorName,
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
        requester_id: userId, vendor_name: orderVendorName,
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
      touchedOrderIds.add(alloc.orderId);
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

  // 주문자에게 알림: 다 들어온 주문은 "들어왔어요", 일부만 들어온 주문은 "일부만 들어왔어요".
  // 주문자마다 한 통으로 묶는다. 알림 저장이 실패해도 명세서 확정은 계속한다.
  {
    const arrived = [];
    const partial = [];
    for (const id of touchedOrderIds) {
      const o = ordersById.get(id);
      if (!o) continue;
      const base = { id, requester_id: o.requester_id, item_name: o.item_name, unit: o.unit };
      if (o.quantity > 0 && o.received_quantity < o.quantity) partial.push({ ...base, received: o.received_quantity, quantity: o.quantity });
      else arrived.push({ ...base, quantity: o.received_quantity, note: "" });
    }
    const notifications = [...arrivalNotifications(arrived, userId), ...partialNotifications(partial, userId)];
    if (notifications.length > 0) {
      const { error: notifyError } = await supabase.from("notifications").insert(notifications);
      if (notifyError) console.error("[invoice-confirm] 알림 저장 실패:", notifyError.message);
    }
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
