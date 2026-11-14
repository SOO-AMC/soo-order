"use server";

import { requireAdmin } from "@/lib/supabase/server";
import { fetchInvoiceLines } from "@/lib/invoices/lines";
import { averageIntervalDays, flagOutliers, priceNear } from "@/lib/utils/price-outlier";
import type { ItemOverview, ItemOrderRow, ItemPricePoint } from "@/lib/types/item-overview";

/**
 * 약품 한눈에 보기 (관리자 전용).
 * 한 품목의 지금 업체별 가격 · 명세서 단가 추이 · 주문 이력(그때 단가 포함)을 한 번에 모은다.
 * 품목은 표준 품목 id 로 주거나, 주문에 적힌 이름으로 준다(이름 → 품목 매칭으로 표준 품목을 찾는다).
 */

const isMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST202" || e.code === "42883" || /could not find|does not exist/i.test(e.message ?? ""));

interface HistoryPayload {
  total: number;
  total_quantity: number;
  first_at: string | null;
  last_at: string | null;
  names: { name: string; n: number }[];
  orders: {
    id: string;
    item_name: string;
    quantity: number;
    unit: string | null;
    status: string;
    vendor_name: string | null;
    created_at: string;
    requester: string | null;
    invoice_unit_price: number | string | null;
    invoice_date: string | null;
  }[];
}

export async function fetchItemOverview(opts: { productId?: string | null; name?: string | null }): Promise<ItemOverview> {
  const { supabase } = await requireAdmin();
  const name = opts.name?.trim() || null;

  // 1) 표준 품목 찾기
  let product: { id: string; name: string; notes: string } | null = null;
  if (opts.productId) {
    const { data } = await supabase.from("unified_products").select("id, name, notes").eq("id", opts.productId).maybeSingle();
    if (data) product = { id: data.id, name: data.name, notes: data.notes ?? "" };
  } else if (name) {
    const { data, error } = await supabase.rpc("standard_product_for", { p_name: name });
    if (!error && data) product = data as { id: string; name: string; notes: string };
  }
  const title = product?.name ?? name ?? "";
  if (!title) return { ready: true, title: "", product: null, currentPrices: [], trend: [], orders: [], names: [], stats: null };

  // 2) 지금 업체별 가격 · 명세서 단가 추이 · 주문 이력
  const [pricesRes, lines, historyRes] = await Promise.all([
    product
      ? supabase.from("vendor_products").select("unit_price, vendors(name, show_in_compare)").eq("unified_product_id", product.id)
      : Promise.resolve({ data: [], error: null }),
    product ? fetchInvoiceLines(supabase, { unifiedProductId: product.id }) : fetchInvoiceLines(supabase, { itemName: name }),
    supabase.rpc("item_order_history", { p_product_id: product?.id ?? null, p_name: product ? null : name, p_limit: 500 }),
  ]);

  if (historyRes.error && !isMissing(historyRes.error)) throw new Error(`주문 이력을 불러오지 못했어요: ${historyRes.error.message}`);
  const ready = !historyRes.error;
  const history = (historyRes.data ?? { total: 0, total_quantity: 0, first_at: null, last_at: null, names: [], orders: [] }) as HistoryPayload;

  const currentPrices = ((pricesRes.data ?? []) as unknown as { unit_price: number | null; vendors: { name: string; show_in_compare: boolean | null } | null }[])
    .filter((p) => p.unit_price != null && p.vendors)
    .map((p) => ({ vendor: p.vendors!.name, price: Number(p.unit_price), main: p.vendors!.show_in_compare !== false }))
    // 같은 업체·같은 가격의 중복 줄은 한 번만 보여 준다
    .filter((p, i, all) => all.findIndex((x) => x.vendor === p.vendor && x.price === p.price) === i)
    .sort((a, b) => a.price - b.price);

  // 단가 추이: 날짜순. 보통 값에서 크게 벗어난 단가는 표시하고 통계에서 뺀다
  const sorted = [...lines].sort((a, b) => (a.invoiceDate ?? "").localeCompare(b.invoiceDate ?? ""));
  const flags = flagOutliers(sorted.map((l) => l.unitPrice));
  const trend: ItemPricePoint[] = sorted.map((l, i) => ({
    date: l.invoiceDate,
    vendor: l.vendorName,
    unitPrice: l.unitPrice,
    quantity: l.quantity,
    outlier: flags[i],
  }));
  const good = trend.filter((t) => !t.outlier && t.unitPrice > 0);

  // 주문 이력 + 그때 단가: 명세서로 검수됐으면 그 단가, 아니면 가까운 날짜의 명세서 단가(추정)
  const orders: ItemOrderRow[] = history.orders.map((o) => {
    const actual = o.invoice_unit_price == null ? null : Number(o.invoice_unit_price);
    const near = actual == null ? priceNear(o.created_at, good) : null;
    return {
      id: o.id,
      itemName: o.item_name,
      quantity: o.quantity,
      unit: o.unit ?? "",
      status: o.status,
      vendor: o.vendor_name ?? "",
      requester: o.requester ?? "",
      createdAt: o.created_at,
      price: actual ?? near?.unitPrice ?? null,
      priceBasis: actual != null ? "invoice" : near ? "estimate" : null,
      priceDate: actual != null ? o.invoice_date : near?.date ?? null,
    };
  });

  const first = good[0]?.unitPrice ?? null;
  const last = good[good.length - 1]?.unitPrice ?? null;
  const prices = good.map((g) => g.unitPrice);

  return {
    ready,
    title,
    product,
    currentPrices,
    trend,
    orders,
    names: history.names ?? [],
    stats: {
      orderCount: history.total ?? 0,
      totalQuantity: history.total_quantity ?? 0,
      firstOrderAt: history.first_at,
      lastOrderAt: history.last_at,
      avgIntervalDays: averageIntervalDays(history.orders.map((o) => o.created_at)),
      lastPrice: last,
      changePct: first && last ? ((last - first) / first) * 100 : null,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      outlierCount: trend.length - good.length,
    },
  };
}

/** 품목 찾기 — 표준 품목 이름 검색 (띄어쓰기 무시) */
export async function searchItems(q: string): Promise<{ id: string; name: string; notes: string }[]> {
  const { supabase } = await requireAdmin();
  if (!q.trim()) return [];
  const { data, error } = await supabase.rpc("search_standard_products", { p_q: q, p_limit: 20 });
  if (error) return [];
  return ((data ?? []) as { id: string; name: string; notes: string | null }[]).map((p) => ({ id: p.id, name: p.name, notes: p.notes ?? "" }));
}
