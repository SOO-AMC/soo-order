"use server";

import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface GSPerson {
  id: string;
  name: string;
  position: string | null;
  /** 오늘부터 3일 근무 요약 (예: 27일 오전근무) */
  schedule: { day: string; label: string }[];
  /** 연차 잔여 요약 (관리자/본인만) */
  leave: { total: number; used: number; periodStart: string | null } | null;
  /** 최근 주문 품목명 (관리자만) */
  recentOrder: string | null;
}
export interface GSProduct {
  name: string;
  price: number | null; // 최저 할인후 단가
}
export interface GSVendor {
  id: string;
  name: string;
}
export interface GSOrder {
  id: string;
  itemName: string;
  vendorName: string | null;
  status: string;
  requesterName: string | null;
}

export interface GlobalSearchResult {
  people: GSPerson[];
  products: GSProduct[];
  vendors: GSVendor[];
  orders: GSOrder[];
  isAdmin: boolean;
}

const EMPTY: GlobalSearchResult = { people: [], products: [], vendors: [], orders: [], isAdmin: false };

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 시프트 시작시각 → 오전/오후/야간근무 */
function shiftLabel(start: string | null): string {
  if (!start) return "근무";
  const h = parseInt(start.split(":")[0] ?? "0", 10);
  if (h >= 18 || h < 5) return "야간근무";
  if (h < 12) return "오전근무";
  return "오후근무";
}

/** 매칭된 직원들의 오늘부터 3일 근무 요약 (근무표는 전 직원 공개 정보 → admin 클라이언트로 조회) */
async function buildSchedules(userIds: string[]): Promise<Map<string, { day: string; label: string }[]>> {
  const result = new Map<string, { day: string; label: string }[]>();
  if (userIds.length === 0) return result;
  const admin = createAdminClient();
  const days = [kstToday(), addDays(kstToday(), 1), addDays(kstToday(), 2)];

  const [shiftsRes, entriesRes, leavesRes] = await Promise.all([
    admin.from("work_shifts").select("id, start_time"),
    admin.from("schedule_entries").select("user_id, work_date, shift_id, status").in("user_id", userIds).in("work_date", days),
    admin
      .from("leave_entries")
      .select("user_id, leave_date, day_portion, leave_types(name)")
      .in("user_id", userIds)
      .in("leave_date", days),
  ]);
  const shiftMap = new Map((shiftsRes.data ?? []).map((s) => [s.id as string, s.start_time as string]));
  const entryMap = new Map<string, { shift_id: string | null; status: string }>();
  for (const e of entriesRes.data ?? []) entryMap.set(`${e.user_id}:${e.work_date}`, { shift_id: e.shift_id, status: e.status });
  const leaveMap = new Map<string, { portion: string; typeName: string }>();
  for (const l of leavesRes.data ?? []) {
    const tn = (l.leave_types as unknown as { name: string } | null)?.name ?? "휴가";
    leaveMap.set(`${l.user_id}:${l.leave_date}`, { portion: l.day_portion as string, typeName: tn });
  }

  for (const uid of userIds) {
    const arr = days.map((d) => {
      const dayN = `${Number(d.slice(8))}일`;
      const lv = leaveMap.get(`${uid}:${d}`);
      const en = entryMap.get(`${uid}:${d}`);
      const sh = en?.shift_id ? shiftMap.get(en.shift_id) ?? null : null;
      let label: string;
      if (lv && lv.portion === "full") label = lv.typeName;
      else if (en && en.status === "work") label = shiftLabel(sh);
      else if (en && en.status === "extra") label = `${shiftLabel(sh)}(특근)`;
      else if (en && en.status === "off_change") label = "휴무변경";
      else if (lv) label = sh ? `${shiftLabel(sh)}(반차)` : "반차";
      else label = "휴무";
      return { day: dayN, label };
    });
    result.set(uid, arr);
  }
  return result;
}

/** 직원별 최근 주문 품목 (전 직원 노출). 주문은 공유 정보 → admin 클라이언트로 조회. */
async function buildRecentOrders(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;
  const admin = createAdminClient();
  const { data } = await admin
    .from("orders")
    .select("requester_id, item_name, created_at")
    .in("requester_id", userIds)
    .order("created_at", { ascending: false });
  for (const o of data ?? []) {
    const uid = o.requester_id as string;
    if (!map.has(uid)) map.set(uid, o.item_name as string);
  }
  return map;
}

/** 직원별 연차 잔여 (관리자 전용 — 개인정보). admin viewer(supabase)로 조회. */
async function buildLeaveBalances(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userIds: string[],
): Promise<Map<string, GSPerson["leave"]>> {
  const map = new Map<string, GSPerson["leave"]>();
  if (userIds.length === 0) return map;

  const [balRes, typesRes] = await Promise.all([
    supabase
      .from("leave_balances")
      .select("id, user_id, total_days, period_start, period_end")
      .in("user_id", userIds)
      .eq("status", "active"), // 주기가 여러 개 쌓이므로 현재 주기만
    supabase.from("leave_types").select("id").eq("deducts_balance", true),
  ]);
  const deductIds = (typesRes.data ?? []).map((t) => t.id as string);

  // 총 연차 = 기본 부여 + 특별연차(leave_grants)
  const balanceIds = (balRes.data ?? []).map((b) => b.id as string);
  const grantSum = new Map<string, number>();
  if (balanceIds.length > 0) {
    const { data: grants } = await supabase
      .from("leave_grants")
      .select("user_id, days")
      .in("balance_id", balanceIds);
    for (const g of grants ?? []) {
      const uid = g.user_id as string;
      grantSum.set(uid, (grantSum.get(uid) ?? 0) + Number(g.days ?? 0));
    }
  }

  const balMap = new Map(
    (balRes.data ?? []).map((b) => [
      b.user_id as string,
      {
        total: Number(b.total_days ?? 0) + (grantSum.get(b.user_id as string) ?? 0),
        start: (b.period_start as string | null) ?? null,
        end: (b.period_end as string | null) ?? null,
      },
    ]),
  );

  const usedMap = new Map<string, number>();
  if (deductIds.length > 0) {
    const { data: entries } = await supabase
      .from("leave_entries")
      .select("user_id, day_portion, leave_date")
      .in("user_id", userIds)
      .in("leave_type_id", deductIds);
    for (const e of entries ?? []) {
      const uid = e.user_id as string;
      const bal = balMap.get(uid);
      const d = e.leave_date as string;
      if (bal?.start && d < bal.start) continue;
      if (bal?.end && d > bal.end) continue;
      usedMap.set(uid, (usedMap.get(uid) ?? 0) + (e.day_portion === "full" ? 1 : 0.5));
    }
  }

  for (const uid of userIds) {
    const bal = balMap.get(uid);
    map.set(uid, bal ? { total: bal.total, used: usedMap.get(uid) ?? 0, periodStart: bal.start } : null);
  }
  return map;
}

/** 앱 전체 검색. 직원은 전 직원, 가격/업체/주문은 관리자 전용(권한 존중). */
export async function globalSearch(q: string): Promise<GlobalSearchResult> {
  const { supabase, userId } = await requireUser();
  const term = (q ?? "").trim();
  if (term.length < 1) return EMPTY;

  const { data: prof } = await supabase.from("profiles").select("role").eq("id", userId).single();
  const isAdmin = prof?.role === "admin";
  const like = `%${term}%`;

  // 직원 (전 직원)
  const { data: ppl } = await supabase
    .from("profiles")
    .select("id, full_name, position")
    .eq("is_active", true)
    .ilike("full_name", like)
    .order("full_name")
    .limit(6);
  const personIds = (ppl ?? []).map((p) => p.id as string);
  // 근무표 3일·최근주문은 전 직원 노출, 연차 잔여는 관리자만(개인정보)
  const [schedules, recentOrders] = await Promise.all([buildSchedules(personIds), buildRecentOrders(personIds)]);
  const leaveMap = isAdmin
    ? await buildLeaveBalances(supabase, personIds)
    : new Map<string, GSPerson["leave"]>();
  const people: GSPerson[] = (ppl ?? []).map((p) => ({
    id: p.id as string,
    name: p.full_name as string,
    position: (p.position as string | null) ?? null,
    schedule: schedules.get(p.id as string) ?? [],
    leave: leaveMap.get(p.id as string) ?? null,
    recentOrder: recentOrders.get(p.id as string) ?? null,
  }));

  if (!isAdmin) return { ...EMPTY, people, isAdmin };

  // 약품 + 최저 단가
  const { data: vps } = await supabase
    .from("vendor_products")
    .select("product_name, unit_price")
    .ilike("product_name", like)
    .limit(60);
  const prodMap = new Map<string, GSProduct>();
  for (const vp of vps ?? []) {
    const name = vp.product_name as string;
    const price = (vp.unit_price as number | null) ?? null;
    const ex = prodMap.get(name);
    if (!ex) prodMap.set(name, { name, price });
    else if (price != null && (ex.price == null || price < ex.price)) ex.price = price;
  }
  const products = [...prodMap.values()].slice(0, 6);

  // 업체
  const { data: vds } = await supabase.from("vendors").select("id, name").ilike("name", like).order("name").limit(6);
  const vendors: GSVendor[] = (vds ?? []).map((v) => ({ id: v.id as string, name: v.name as string }));

  // 주문/검수/반품 (품목명)
  const { data: ords } = await supabase
    .from("orders")
    .select("id, item_name, vendor_name, status, requester:profiles!requester_id(full_name)")
    .ilike("item_name", like)
    .order("created_at", { ascending: false })
    .limit(6);
  const orders: GSOrder[] = (ords ?? []).map((o) => ({
    id: o.id as string,
    itemName: o.item_name as string,
    vendorName: (o.vendor_name as string | null) ?? null,
    status: o.status as string,
    requesterName: (o.requester as unknown as { full_name: string | null } | null)?.full_name ?? null,
  }));

  return { people, products, vendors, orders, isAdmin };
}
