import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchFilters } from "@/lib/utils/search-params";
import { kstDateToUtcRange } from "@/lib/utils/search-params";
import type { OrderWithRequester } from "@/lib/types/order";

const SELECT_QUERY =
  "*, requester:profiles!requester_id(full_name), updater:profiles!updated_by(full_name), inspector:profiles!inspected_by(full_name), return_requester:profiles!return_requested_by(full_name)";

export const PAGE_SIZE = 50;

/** 이름 → profile id 일괄 조회 */
async function resolveNameToIds(
  supabase: SupabaseClient,
  names: { name: string; key: string }[]
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  const uniqueNames = names.filter((n) => n.name);

  if (uniqueNames.length === 0) return result;

  const nameValues = [...new Set(uniqueNames.map((n) => n.name))];
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("full_name", nameValues);

  const nameMap = new Map<string, string>();
  data?.forEach((p) => {
    if (p.full_name) nameMap.set(p.full_name, p.id);
  });

  for (const { name, key } of uniqueNames) {
    result[key] = nameMap.get(name) ?? null;
  }

  return result;
}

/** 필터를 Supabase 쿼리에 적용하고 실행 (range 포함) */
async function executeFilteredQuery(
  supabase: SupabaseClient,
  filters: SearchFilters,
  range?: { from: number; to: number }
): Promise<{ data: OrderWithRequester[]; count: number | null; error: unknown }> {
  // 사람 이름 → ID 변환 (이름 필터가 있을 때만 쿼리 실행)
  const nameQueries = [
    { name: filters.requester, key: "requester_id" },
    { name: filters.updater, key: "updated_by" },
    { name: filters.inspector, key: "inspected_by" },
    { name: filters.retRequester, key: "return_requested_by" },
  ];
  const hasNameFilter = nameQueries.some((n) => n.name);
  const idMap = hasNameFilter
    ? await resolveNameToIds(supabase, nameQueries)
    : {};

  let query = supabase
    .from("orders")
    .select(SELECT_QUERY, { count: "exact" })
    .order("created_at", { ascending: false });

  // 텍스트 검색
  if (filters.q) {
    const q = filters.q.replace(/%/g, "\\%");
    query = query.or(`item_name.ilike.%${q}%,vendor_name.ilike.%${q}%`);
  }

  // 유형
  if (filters.type !== "all") {
    query = query.eq("type", filters.type);
  }

  // 상태 (다중 선택)
  if (filters.status.length > 0 && filters.status.length < 6) {
    query = query.in("status", filters.status);
  }

  // 긴급 (다중 선택)
  if (filters.urgent.length === 1) {
    query = query.eq("is_urgent", filters.urgent[0] === "urgent");
  }

  // 거래명세서 (다중 선택)
  if (filters.invoice.length === 1) {
    query = query.eq("invoice_received", filters.invoice[0] === "received");
  }

  // 사람 필터
  const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000";
  if (filters.requester) {
    query = query.eq("requester_id", idMap["requester_id"] ?? NO_MATCH_ID);
  }
  if (filters.updater) {
    query = query.eq("updated_by", idMap["updated_by"] ?? NO_MATCH_ID);
  }
  if (filters.inspector) {
    query = query.eq("inspected_by", idMap["inspected_by"] ?? NO_MATCH_ID);
  }
  if (filters.retRequester) {
    query = query.eq("return_requested_by", idMap["return_requested_by"] ?? NO_MATCH_ID);
  }

  // 요청 날짜
  if (filters.dateFrom) {
    const { gte } = kstDateToUtcRange(filters.dateFrom);
    query = query.gte("created_at", gte);
  }
  if (filters.dateTo) {
    const { lt } = kstDateToUtcRange(filters.dateTo);
    query = query.lt("created_at", lt);
  }

  // 발주 날짜 (updated_at)
  if (filters.ordDateFrom) {
    const { gte } = kstDateToUtcRange(filters.ordDateFrom);
    query = query.gte("updated_at", gte);
  }
  if (filters.ordDateTo) {
    const { lt } = kstDateToUtcRange(filters.ordDateTo);
    query = query.lt("updated_at", lt);
  }

  // 검수 날짜
  if (filters.inspDateFrom) {
    const { gte } = kstDateToUtcRange(filters.inspDateFrom);
    query = query.gte("inspected_at", gte);
  }
  if (filters.inspDateTo) {
    const { lt } = kstDateToUtcRange(filters.inspDateTo);
    query = query.lt("inspected_at", lt);
  }

  // 반품 날짜
  if (filters.retDateFrom) {
    const { gte } = kstDateToUtcRange(filters.retDateFrom);
    query = query.gte("return_requested_at", gte);
  }
  if (filters.retDateTo) {
    const { lt } = kstDateToUtcRange(filters.retDateTo);
    query = query.lt("return_requested_at", lt);
  }

  // 페이지네이션
  if (range) {
    query = query.range(range.from, range.to);
  }

  const { data, count, error } = await query;

  return {
    data: (data as OrderWithRequester[]) ?? [],
    count,
    error,
  };
}

/** 페이지네이션된 결과 조회 */
export async function fetchSearchOrders(
  supabase: SupabaseClient,
  filters: SearchFilters
): Promise<{ orders: OrderWithRequester[]; totalCount: number }> {
  const from = (filters.page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, count, error } = await executeFilteredQuery(supabase, filters, {
    from,
    to,
  });

  if (error) {
    console.error("fetchSearchOrders error:", error);
    return { orders: [], totalCount: 0 };
  }

  return {
    orders: data,
    totalCount: count ?? 0,
  };
}

/** 엑셀 다운로드용 전체 결과 조회 (페이지네이션 없음) */
export async function fetchAllSearchOrders(
  supabase: SupabaseClient,
  filters: SearchFilters
): Promise<OrderWithRequester[]> {
  const PAGE = 1000;
  const allOrders: OrderWithRequester[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await executeFilteredQuery(supabase, filters, {
      from,
      to: from + PAGE - 1,
    });

    if (error || data.length === 0) break;
    allOrders.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return allOrders;
}
