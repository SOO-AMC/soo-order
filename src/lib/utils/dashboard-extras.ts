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
// C. 지출 추이 (명세서 금액 합계)
//   예전에는 "주문 수량 × 가격비교 단가"로 추정했는데, 이름이 맞는 주문이 1/3뿐이라 실제의 1/10 수준으로 나왔다.
//   이제 확정된 명세서의 금액을 그대로 더한다 → 거래처원장의 같은 기간 합계와 같은 숫자.
// ─────────────────────────────────────────────
export interface SpendLine {
  invoiceId: string;
  invoiceDate: string | null; // YYYY-MM-DD
  amount: number;
  vendorId: string | null;
  vendorName: string;
}

/** 기준일(YYYY-MM-DD)을 포함해 과거로 monthsBack 개월의 "YYYY-MM" 목록 (오래된 달 → 이번 달) */
export function spendMonthLabels(today: string, monthsBack: number): string[] {
  const [y, m] = today.split("-").map(Number);
  const out: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const idx = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}

export function computeInvoiceSpend(
  lines: SpendLine[],
  vendorNameById: Map<string, string>,
  today: string,
  monthsBack: number,
): SpendData {
  const labels = spendMonthLabels(today, monthsBack);
  const thisKey = labels[labels.length - 1];
  const lastKey = spendMonthLabels(today, 2)[0];
  const lastToDateEnd = `${lastKey}-${today.slice(8, 10)}`; // 지난달의 같은 날짜 (문자열 비교라 31일이 없는 달도 안전)

  const monthSums = new Map<string, number>(labels.map((l) => [l, 0]));
  const vendorSums = new Map<string, number>();
  const invoicesThisMonth = new Set<string>();
  let lastToDate = 0;

  for (const l of lines) {
    if (!l.invoiceDate) continue;
    const key = l.invoiceDate.slice(0, 7);
    if (!monthSums.has(key)) continue;
    monthSums.set(key, (monthSums.get(key) ?? 0) + l.amount);
    if (key === lastKey && l.invoiceDate <= lastToDateEnd) lastToDate += l.amount;
    if (key === thisKey) {
      invoicesThisMonth.add(l.invoiceId);
      // 명세서에 찍힌 글자가 아니라 연결된 업체 이름으로 묶는다 (같은 업체가 여러 이름으로 갈라지지 않게)
      const name = (l.vendorId && vendorNameById.get(l.vendorId)) || l.vendorName.trim() || "(업체 미지정)";
      vendorSums.set(name, (vendorSums.get(name) ?? 0) + l.amount);
    }
  }

  return {
    monthly: labels.map((l) => ({ label: l, amount: Math.round(monthSums.get(l) ?? 0) })),
    byVendorThisMonth: [...vendorSums.entries()]
      .map(([vendor, amount]) => ({ vendor, amount: Math.round(amount) }))
      .sort((a, b) => b.amount - a.amount),
    thisMonthAmount: Math.round(monthSums.get(thisKey) ?? 0),
    lastMonthAmount: Math.round(monthSums.get(lastKey) ?? 0),
    lastMonthToDateAmount: Math.round(lastToDate),
    invoiceCountThisMonth: invoicesThisMonth.size,
    asOf: today,
  };
}
