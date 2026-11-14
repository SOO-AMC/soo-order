"use server";

import { requireAdmin } from "@/lib/supabase/server";
import { normalizeItemName } from "@/lib/utils/normalize-item-name";
import { fetchInvoiceLines } from "@/lib/invoices/lines";
import { fetchAllPages } from "@/lib/supabase/paginate";
import { isSuspectChange } from "@/lib/utils/price-outlier";
import type { PriceAnalysisResult, PriceAnalysisRow, ItemTrendPoint } from "@/lib/types/invoice";

const EMPTY: PriceAnalysisResult = {
  rows: [],
  weightedInflationPct: null,
  simpleAvgPct: null,
  basketBase: 0,
  basketNow: 0,
  comparedCount: 0,
  suspectCount: 0,
  newItems: [],
  droppedItems: [],
};

/**
 * 두 기간(A: 기준 / B: 비교)의 품목별 수량가중 평균 단가를 비교하고,
 * 과거(A) 구매량 가중 인상률(라스파이레스)을 산출한다. invoice_items 기반. 관리자 전용.
 */
export async function fetchPriceAnalysis(opts: {
  aStart: string;
  aEnd: string;
  bStart: string;
  bEnd: string;
  vendorId?: string | null;
}): Promise<PriceAnalysisResult> {
  const { supabase } = await requireAdmin();
  if (!opts.aStart || !opts.aEnd || !opts.bStart || !opts.bEnd) return EMPTY;

  const lo = [opts.aStart, opts.bStart].sort()[0];
  const hi = [opts.aEnd, opts.bEnd].sort()[1];

  // 두 기간을 덮는 범위의 줄을 끝까지 읽는다 (1,000줄 제한·id 목록 길이 제한 없음)
  const itemList = await fetchInvoiceLines(supabase, { vendorId: opts.vendorId, start: lo, end: hi });
  if (itemList.length === 0) return EMPTY;

  const inA = (d: string | null) => d != null && d >= opts.aStart && d <= opts.aEnd;
  const inB = (d: string | null) => d != null && d >= opts.bStart && d <= opts.bEnd;

  interface Agg {
    name: string;
    unifiedProductId: string | null;
    aQty: number;
    aSum: number;
    bQty: number;
    bSum: number;
  }
  const groups = new Map<string, Agg>();
  for (const it of itemList) {
    const d = it.invoiceDate;
    const isA = inA(d);
    const isB = inB(d);
    if (!isA && !isB) continue;
    const key = it.unifiedProductId ?? "n:" + normalizeItemName(it.itemName);
    let g = groups.get(key);
    if (!g) {
      g = { name: it.itemName, unifiedProductId: it.unifiedProductId, aQty: 0, aSum: 0, bQty: 0, bSum: 0 };
      groups.set(key, g);
    }
    if (isB) g.name = it.itemName; // 최근 표기 우선
    if (isA) {
      g.aQty += it.quantity;
      g.aSum += it.unitPrice * it.quantity;
    }
    if (isB) {
      g.bQty += it.quantity;
      g.bSum += it.unitPrice * it.quantity;
    }
  }

  const rows: PriceAnalysisRow[] = [];
  const newItems: PriceAnalysisResult["newItems"] = [];
  const droppedItems: PriceAnalysisResult["droppedItems"] = [];
  let basketBase = 0;
  let basketNow = 0;
  const pctList: number[] = [];

  for (const [key, g] of groups) {
    const aPrice = g.aQty > 0 ? Math.round(g.aSum / g.aQty) : null;
    const bPrice = g.bQty > 0 ? Math.round(g.bSum / g.bQty) : null;
    // 단가가 0 이하인 줄(마일리지 차감·할인·반품 같은 줄)은 약품이 아니므로 단가 비교에서 뺀다
    if ((aPrice != null && aPrice <= 0) || (bPrice != null && bPrice <= 0)) continue;
    if (aPrice != null && bPrice != null) {
      const deltaAbs = bPrice - aPrice;
      const deltaPct = aPrice > 0 ? (deltaAbs / aPrice) * 100 : null;
      // 2배 이상·절반 이하로 바뀐 단가는 실제 인상보다 입력 오류(자릿수·묶음 단위)일 가능성이 크다.
      // 목록에는 "확인 필요"로 보여 주되 인상률 계산에서는 뺀다 — 한 품목이 전체 숫자를 끌고 가지 않게.
      const suspect = isSuspectChange(aPrice, bPrice);
      rows.push({ key, name: g.name, unifiedProductId: g.unifiedProductId, aPrice, bPrice, aQty: g.aQty, bQty: g.bQty, deltaAbs, deltaPct, suspect });
      if (!suspect) {
        basketBase += g.aQty * aPrice;
        basketNow += g.aQty * bPrice;
        if (deltaPct != null) pctList.push(deltaPct);
      }
    } else if (aPrice == null && bPrice != null) {
      newItems.push({ name: g.name, bPrice, bQty: g.bQty });
    } else if (aPrice != null && bPrice == null) {
      droppedItems.push({ name: g.name, aPrice, aQty: g.aQty });
    }
  }

  rows.sort((a, b) => (b.deltaPct ?? -Infinity) - (a.deltaPct ?? -Infinity));

  return {
    rows,
    weightedInflationPct: basketBase > 0 ? (basketNow / basketBase - 1) * 100 : null,
    simpleAvgPct: pctList.length ? pctList.reduce((s, x) => s + x, 0) / pctList.length : null,
    basketBase,
    basketNow,
    comparedCount: rows.length,
    suspectCount: rows.filter((r) => r.suspect).length,
    newItems,
    droppedItems,
  };
}

/** 명세서에 등장한 품목 목록(중복 제거) — 품목 추이 검색용. 관리자 전용. */
export async function fetchTrendProducts(): Promise<{ key: string; name: string; unifiedProductId: string | null }[]> {
  const { supabase } = await requireAdmin();
  const rows = await fetchAllPages<{ item_name: string; unified_product_id: string | null }>(
    (from, to) => supabase.from("invoice_items").select("item_name, unified_product_id").order("id").range(from, to),
    { label: "명세서 품목 목록" },
  );
  const seen = new Map<string, { key: string; name: string; unifiedProductId: string | null }>();
  for (const it of rows) {
    const key = it.unified_product_id ?? "n:" + normalizeItemName(it.item_name);
    if (!seen.has(key)) seen.set(key, { key, name: it.item_name, unifiedProductId: it.unified_product_id });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

/** 특정 품목의 명세서 날짜별 단가 추이 (전체 기간). 관리자 전용. */
export async function fetchItemPriceTrend(opts: {
  unifiedProductId?: string | null;
  itemName: string;
  vendorId?: string | null;
}): Promise<ItemTrendPoint[]> {
  const { supabase } = await requireAdmin();

  const lines = await fetchInvoiceLines(supabase, {
    vendorId: opts.vendorId,
    unifiedProductId: opts.unifiedProductId,
    itemName: opts.itemName,
  });
  const points: ItemTrendPoint[] = lines.map((l) => ({
    date: l.invoiceDate,
    vendorName: l.vendorName,
    unitPrice: l.unitPrice,
    listPrice: l.listPrice,
    quantity: l.quantity,
  }));
  points.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  return points;
}
