import { normalizeItemName } from "./normalize-item-name";
import type { AlertsData, AlertItem, LeadTimeData, SpendData } from "@/lib/types/dashboard";

// ─────────────────────────────────────────────
// B. 할 일 알림
// ─────────────────────────────────────────────
const PENDING_AGING_DAYS = 3;
const ORDERED_AGING_DAYS = 7;
const RETURN_AGING_DAYS = 3;
const ALERT_TOP = 12;

export interface AlertOrderRow {
  id: string;
  status: string;
  item_name: string;
  quantity: number;
  unit: string | null;
  is_urgent: boolean | null;
  vendor_name: string | null;
  created_at: string;
  dispatched_at: string | null;
  updated_at: string;
  return_requested_at: string | null;
  requester: { full_name: string | null } | null;
}

const DAY_MS = 86400000;
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
}
function ts(iso: string): number {
  return new Date(iso).getTime();
}

function toAlertItem(o: AlertOrderRow, sinceIso: string): AlertItem {
  return {
    id: o.id,
    itemName: o.item_name,
    quantity: o.quantity,
    unit: o.unit ?? "",
    requester: o.requester?.full_name ?? "?",
    vendor: o.vendor_name ?? "",
    days: daysSince(sinceIso),
    isUrgent: !!o.is_urgent,
    status: o.status,
  };
}

export function computeAlerts(active: AlertOrderRow[]): AlertsData {
  const sinceOrdered = (o: AlertOrderRow) => o.dispatched_at ?? o.updated_at;

  const agingPending = active
    .filter((o) => o.status === "pending" && daysSince(o.created_at) >= PENDING_AGING_DAYS)
    .sort((a, b) => ts(a.created_at) - ts(b.created_at))
    .map((o) => toAlertItem(o, o.created_at));

  const agingOrdered = active
    .filter((o) => o.status === "ordered" && daysSince(sinceOrdered(o)) >= ORDERED_AGING_DAYS)
    .sort((a, b) => ts(sinceOrdered(a)) - ts(sinceOrdered(b)))
    .map((o) => toAlertItem(o, sinceOrdered(o)));

  const agingReturns = active
    .filter((o) => o.status === "return_requested" && o.return_requested_at && daysSince(o.return_requested_at) >= RETURN_AGING_DAYS)
    .sort((a, b) => ts(a.return_requested_at as string) - ts(b.return_requested_at as string))
    .map((o) => toAlertItem(o, o.return_requested_at as string));

  const urgentUnhandled = active
    .filter((o) => o.is_urgent && (o.status === "pending" || o.status === "ordered"))
    .sort((a, b) => ts(a.created_at) - ts(b.created_at))
    .map((o) => toAlertItem(o, o.created_at));

  const sec = (items: AlertItem[]) => ({ count: items.length, items: items.slice(0, ALERT_TOP) });
  return {
    agingPending: sec(agingPending),
    agingOrdered: sec(agingOrdered),
    agingReturns: sec(agingReturns),
    urgentUnhandled: sec(urgentUnhandled),
    thresholds: { pendingDays: PENDING_AGING_DAYS, orderedDays: ORDERED_AGING_DAYS, returnDays: RETURN_AGING_DAYS },
  };
}

// ─────────────────────────────────────────────
// A. 처리 시간 / 병목
// ─────────────────────────────────────────────
const LEAD_WINDOW_DAYS = 60;
const HOUR_MS = 3600000;

export interface LeadTimeOrderRow {
  item_name: string;
  created_at: string;
  dispatched_at: string | null;
  inspected_at: string | null;
}

function hoursBetween(aIso: string, bIso: string): number {
  return (ts(bIso) - ts(aIso)) / HOUR_MS;
}
function avg(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}
function pushTo(m: Map<string, number[]>, k: string, v: number) {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
}

export function computeLeadTime(inspected: LeadTimeOrderRow[]): LeadTimeData {
  const now = Date.now();
  const windowMs = LEAD_WINDOW_DAYS * DAY_MS;
  const recentCut = now - windowMs;
  const prevCut = now - 2 * windowMs;

  type Sample = { dispatchH: number | null; inspectH: number | null; tsv: number; item: string };
  const samples: Sample[] = [];
  for (const o of inspected) {
    if (!o.inspected_at) continue;
    const inspTs = ts(o.inspected_at);
    if (inspTs < prevCut) continue;
    const dispatchH = o.dispatched_at ? Math.max(0, hoursBetween(o.created_at, o.dispatched_at)) : null;
    const inspectH = o.dispatched_at ? Math.max(0, hoursBetween(o.dispatched_at, o.inspected_at)) : null;
    samples.push({ dispatchH, inspectH, tsv: inspTs, item: o.item_name });
  }
  const recent = samples.filter((s) => s.tsv >= recentCut);
  const prev = samples.filter((s) => s.tsv < recentCut);

  const stageStat = (key: string, label: string, pick: (s: Sample) => number | null) => {
    const r = recent.map(pick).filter((x): x is number => x != null);
    const p = prev.map(pick).filter((x): x is number => x != null);
    return { key, label, avgHours: avg(r), avgHoursPrev: avg(p), count: r.length };
  };

  const byItemDispatch = new Map<string, number[]>();
  const byItemInspect = new Map<string, number[]>();
  for (const s of recent) {
    if (s.dispatchH != null) pushTo(byItemDispatch, s.item, s.dispatchH);
    if (s.inspectH != null) pushTo(byItemInspect, s.item, s.inspectH);
  }
  const slowest = (m: Map<string, number[]>) =>
    [...m.entries()]
      .map(([name, xs]) => ({ name, hours: avg(xs) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5);

  return {
    windowDays: LEAD_WINDOW_DAYS,
    stages: [
      stageStat("dispatch", "주문신청 → 발주", (s) => s.dispatchH),
      stageStat("inspect", "발주 → 검수완료", (s) => s.inspectH),
    ],
    slowestToDispatch: slowest(byItemDispatch),
    slowestToInspect: slowest(byItemInspect),
  };
}

// ─────────────────────────────────────────────
// C. 지출 추이 (가격매칭 기반 추정)
// ─────────────────────────────────────────────
export interface SpendOrderRow {
  item_name: string;
  quantity: number;
  vendor_name: string | null;
  created_at: string;
}
export interface VendorMini {
  id: string;
  name: string;
}
export interface VendorProductMini {
  vendor_id: string;
  product_name: string;
  unit_price: number | null;
  unified_product_id: string | null;
}
export interface AliasMini {
  item_name: string;
  unified_product_id: string;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function computeSpend(
  orders: SpendOrderRow[],
  vendors: VendorMini[],
  vendorProducts: VendorProductMini[],
  aliases: AliasMini[],
  monthsBack: number,
): SpendData {
  const vendorIdByNorm = new Map<string, string>();
  for (const v of vendors) vendorIdByNorm.set(normalizeItemName(v.name), v.id);
  const aliasMap = new Map<string, string>();
  for (const a of aliases) aliasMap.set(a.item_name, a.unified_product_id);

  const vpByUnified = new Map<string, VendorProductMini[]>();
  const vpByNormName = new Map<string, VendorProductMini[]>();
  for (const vp of vendorProducts) {
    if (vp.unified_product_id) {
      const arr = vpByUnified.get(vp.unified_product_id);
      if (arr) arr.push(vp);
      else vpByUnified.set(vp.unified_product_id, [vp]);
    }
    const nn = normalizeItemName(vp.product_name);
    if (nn) {
      const arr = vpByNormName.get(nn);
      if (arr) arr.push(vp);
      else vpByNormName.set(nn, [vp]);
    }
  }

  const priceFor = (itemName: string, vendorName: string | null): number | null => {
    const norm = normalizeItemName(itemName);
    if (!norm) return null;
    const vendorId = vendorName ? vendorIdByNorm.get(normalizeItemName(vendorName)) : undefined;
    const pickPrice = (cands: VendorProductMini[]): number | null => {
      if (vendorId) {
        const own = cands.find((c) => c.vendor_id === vendorId && c.unit_price != null);
        if (own?.unit_price != null) return own.unit_price;
      }
      const any = cands.find((c) => c.unit_price != null);
      return any?.unit_price ?? null;
    };
    const uid = aliasMap.get(norm);
    if (uid) {
      const p = pickPrice(vpByUnified.get(uid) ?? []);
      if (p != null) return p;
    }
    return pickPrice(vpByNormName.get(norm) ?? []);
  };

  const now = new Date();
  const monthLabels: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    monthLabels.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  const monthSums = new Map<string, number>(monthLabels.map((m) => [m, 0]));
  const thisMonthKey = monthKey(now);
  const lastMonthKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const vendorSumsThisMonth = new Map<string, number>();

  let matched = 0;
  let total = 0;
  for (const o of orders) {
    const mk = monthKey(new Date(o.created_at));
    if (!monthSums.has(mk)) continue;
    total++;
    const price = priceFor(o.item_name, o.vendor_name);
    if (price == null || o.quantity <= 0) continue;
    const amount = price * o.quantity;
    monthSums.set(mk, (monthSums.get(mk) ?? 0) + amount);
    matched++;
    if (mk === thisMonthKey) {
      const vn = o.vendor_name?.trim() || "(미지정)";
      vendorSumsThisMonth.set(vn, (vendorSumsThisMonth.get(vn) ?? 0) + amount);
    }
  }

  return {
    monthly: monthLabels.map((m) => ({ label: m, amount: Math.round(monthSums.get(m) ?? 0) })),
    byVendorThisMonth: [...vendorSumsThisMonth.entries()]
      .map(([vendor, amount]) => ({ vendor, amount: Math.round(amount) }))
      .sort((a, b) => b.amount - a.amount),
    matchedCount: matched,
    totalCount: total,
    thisMonthAmount: Math.round(monthSums.get(thisMonthKey) ?? 0),
    lastMonthAmount: Math.round(monthSums.get(lastMonthKey) ?? 0),
  };
}
