"use server";

import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface GSPerson {
  id: string;
  name: string;
  position: string | null;
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

/** 앱 전체 검색. 직원은 전 직원, 가격/업체/주문은 관리자 전용(권한 존중). */
export async function globalSearch(q: string): Promise<GlobalSearchResult> {
  const { supabase, userId } = await requireUser();
  const term = (q ?? "").trim();
  if (term.length < 1) return EMPTY;

  const { data: prof } = await supabase.from("profiles").select("role").eq("id", userId).single();
  // 세미나실 화면 전용 계정은 검색하지 못한다 (아래에서 관리자 클라이언트로 주문을 읽기 때문)
  if (prof?.role === "display") return EMPTY;
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
  // 인사(연차·근무표) 화면은 앱에서 빠짐 → 최근 주문만 보여줌
  const recentOrders = await buildRecentOrders(personIds);
  const people: GSPerson[] = (ppl ?? []).map((p) => ({
    id: p.id as string,
    name: p.full_name as string,
    position: (p.position as string | null) ?? null,
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
