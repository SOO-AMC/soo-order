"use server";

import { requireAdmin } from "@/lib/supabase/server";
import { normalizeItemName } from "@/lib/utils/normalize-item-name";
import type { PriceAnalysisResult, PriceAnalysisRow, ItemTrendPoint } from "@/lib/types/invoice";

interface InvRow {
  id: string;
  vendor_id: string | null;
  vendor_name: string;
  invoice_date: string | null;
}
interface ItemRow {
  invoice_id: string;
  unified_product_id: string | null;
  item_name: string;
  unit_price: number;
  quantity: number;
}
interface TrendItemRow {
  invoice_id: string;
  unit_price: number;
  list_price: number;
  quantity: number;
}

const EMPTY: PriceAnalysisResult = {
  rows: [],
  weightedInflationPct: null,
  simpleAvgPct: null,
  basketBase: 0,
  basketNow: 0,
  comparedCount: 0,
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

  let q = supabase
    .from("invoices")
    .select("id, vendor_id, vendor_name, invoice_date")
    .gte("invoice_date", lo)
    .lte("invoice_date", hi);
  if (opts.vendorId) q = q.eq("vendor_id", opts.vendorId);
  const { data: invoices } = await q;
  const invList = (invoices as InvRow[]) ?? [];
  if (invList.length === 0) return EMPTY;

  const dateById = new Map(invList.map((i) => [i.id, i.invoice_date] as const));

  const { data: items } = await supabase
    .from("invoice_items")
    .select("invoice_id, unified_product_id, item_name, unit_price, quantity")
    .in("invoice_id", invList.map((i) => i.id));
  const itemList = (items as ItemRow[]) ?? [];

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
    const d = dateById.get(it.invoice_id) ?? null;
    const isA = inA(d);
    const isB = inB(d);
    if (!isA && !isB) continue;
    const key = it.unified_product_id ?? "n:" + normalizeItemName(it.item_name);
    let g = groups.get(key);
    if (!g) {
      g = { name: it.item_name, unifiedProductId: it.unified_product_id, aQty: 0, aSum: 0, bQty: 0, bSum: 0 };
      groups.set(key, g);
    }
    if (isB) g.name = it.item_name; // 최근 표기 우선
    if (isA) {
      g.aQty += it.quantity;
      g.aSum += it.unit_price * it.quantity;
    }
    if (isB) {
      g.bQty += it.quantity;
      g.bSum += it.unit_price * it.quantity;
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
    if (aPrice != null && bPrice != null) {
      const deltaAbs = bPrice - aPrice;
      const deltaPct = aPrice > 0 ? (deltaAbs / aPrice) * 100 : null;
      rows.push({ key, name: g.name, unifiedProductId: g.unifiedProductId, aPrice, bPrice, aQty: g.aQty, bQty: g.bQty, deltaAbs, deltaPct });
      basketBase += g.aQty * aPrice;
      basketNow += g.aQty * bPrice;
      if (deltaPct != null) pctList.push(deltaPct);
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
    newItems,
    droppedItems,
  };
}

/** 명세서에 등장한 품목 목록(중복 제거) — 품목 추이 검색용. 관리자 전용. */
export async function fetchTrendProducts(): Promise<{ key: string; name: string; unifiedProductId: string | null }[]> {
  const { supabase } = await requireAdmin();
  const PAGE = 1000;
  const seen = new Map<string, { key: string; name: string; unifiedProductId: string | null }>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("invoice_items")
      .select("item_name, unified_product_id")
      .range(from, from + PAGE - 1);
    const rows = (data as { item_name: string; unified_product_id: string | null }[]) ?? [];
    if (error || rows.length === 0) break;
    for (const it of rows) {
      const key = it.unified_product_id ?? "n:" + normalizeItemName(it.item_name);
      if (!seen.has(key)) seen.set(key, { key, name: it.item_name, unifiedProductId: it.unified_product_id });
    }
    if (rows.length < PAGE) break;
    from += PAGE;
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

  let iq = supabase.from("invoice_items").select("invoice_id, unit_price, list_price, quantity");
  if (opts.unifiedProductId) iq = iq.eq("unified_product_id", opts.unifiedProductId);
  else iq = iq.eq("item_name", opts.itemName);
  const { data: items } = await iq;
  const itemList = (items as TrendItemRow[]) ?? [];
  if (itemList.length === 0) return [];

  const invIds = [...new Set(itemList.map((i) => i.invoice_id))];
  let vq = supabase.from("invoices").select("id, vendor_id, vendor_name, invoice_date").in("id", invIds);
  if (opts.vendorId) vq = vq.eq("vendor_id", opts.vendorId);
  const { data: invs } = await vq;
  const invMap = new Map((((invs as InvRow[]) ?? [])).map((i) => [i.id, i] as const));

  const points: ItemTrendPoint[] = [];
  for (const it of itemList) {
    const inv = invMap.get(it.invoice_id);
    if (!inv) continue;
    points.push({ date: inv.invoice_date, vendorName: inv.vendor_name, unitPrice: it.unit_price, listPrice: it.list_price, quantity: it.quantity });
  }
  points.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  return points;
}
