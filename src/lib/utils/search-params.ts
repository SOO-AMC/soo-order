export interface SearchFilters {
  q: string;
  type: "all" | "order" | "return";
  status: "all" | "pending" | "ordered" | "inspecting" | "return_requested" | "return_completed";
  requester: string;
  updater: string;
  inspector: string;
  dateFrom: string;
  dateTo: string;
  ordDateFrom: string;
  ordDateTo: string;
  inspDateFrom: string;
  inspDateTo: string;
  retRequester: string;
  retDateFrom: string;
  retDateTo: string;
  invoice: "all" | "received" | "not_received";
  urgent: "all" | "urgent" | "normal";
  page: number;
}

export const defaultFilters: SearchFilters = {
  q: "",
  type: "all",
  status: "all",
  requester: "",
  updater: "",
  inspector: "",
  dateFrom: "",
  dateTo: "",
  ordDateFrom: "",
  ordDateTo: "",
  inspDateFrom: "",
  inspDateTo: "",
  retRequester: "",
  retDateFrom: "",
  retDateTo: "",
  invoice: "all",
  urgent: "all",
  page: 1,
};

/** URL searchParams → SearchFilters */
export function parseSearchParams(
  params: Record<string, string | string[] | undefined>
): SearchFilters {
  const s = (key: string): string => {
    const v = params[key];
    return typeof v === "string" ? v : "";
  };

  return {
    q: s("q"),
    type: (s("type") || "all") as SearchFilters["type"],
    status: (s("status") || "all") as SearchFilters["status"],
    requester: s("requester"),
    updater: s("updater"),
    inspector: s("inspector"),
    dateFrom: s("dateFrom"),
    dateTo: s("dateTo"),
    ordDateFrom: s("ordDateFrom"),
    ordDateTo: s("ordDateTo"),
    inspDateFrom: s("inspDateFrom"),
    inspDateTo: s("inspDateTo"),
    retRequester: s("retRequester"),
    retDateFrom: s("retDateFrom"),
    retDateTo: s("retDateTo"),
    invoice: (s("invoice") || "all") as SearchFilters["invoice"],
    urgent: (s("urgent") || "all") as SearchFilters["urgent"],
    page: Math.max(1, parseInt(s("page") || "1", 10) || 1),
  };
}

/** SearchFilters → URL search string (default 값은 생략) */
export function filtersToSearchString(filters: SearchFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.requester) params.set("requester", filters.requester);
  if (filters.updater) params.set("updater", filters.updater);
  if (filters.inspector) params.set("inspector", filters.inspector);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.ordDateFrom) params.set("ordDateFrom", filters.ordDateFrom);
  if (filters.ordDateTo) params.set("ordDateTo", filters.ordDateTo);
  if (filters.inspDateFrom) params.set("inspDateFrom", filters.inspDateFrom);
  if (filters.inspDateTo) params.set("inspDateTo", filters.inspDateTo);
  if (filters.retRequester) params.set("retRequester", filters.retRequester);
  if (filters.retDateFrom) params.set("retDateFrom", filters.retDateFrom);
  if (filters.retDateTo) params.set("retDateTo", filters.retDateTo);
  if (filters.invoice !== "all") params.set("invoice", filters.invoice);
  if (filters.urgent !== "all") params.set("urgent", filters.urgent);
  if (filters.page > 1) params.set("page", String(filters.page));
  const str = params.toString();
  return str ? `?${str}` : "";
}

/**
 * KST 날짜 문자열 "YYYY-MM-DD" → UTC ISO 범위 [start, end)
 * 예: "2024-01-15" → ["2024-01-14T15:00:00.000Z", "2024-01-15T15:00:00.000Z")
 */
export function kstDateToUtcRange(dateStr: string): { gte: string; lt: string } {
  // dateStr is KST date, KST = UTC+9
  const gte = new Date(`${dateStr}T00:00:00+09:00`).toISOString();
  const lt = new Date(`${dateStr}T00:00:00+09:00`);
  lt.setDate(lt.getDate() + 1);
  return { gte, lt: lt.toISOString() };
}

/** 활성 필터 개수 (q와 page 제외) */
export function countActiveFilters(filters: SearchFilters): number {
  let count = 0;
  if (filters.type !== "all") count++;
  if (filters.status !== "all") count++;
  if (filters.requester) count++;
  if (filters.updater) count++;
  if (filters.inspector) count++;
  if (filters.dateFrom || filters.dateTo) count++;
  if (filters.ordDateFrom || filters.ordDateTo) count++;
  if (filters.inspDateFrom || filters.inspDateTo) count++;
  if (filters.retRequester) count++;
  if (filters.retDateFrom || filters.retDateTo) count++;
  if (filters.invoice !== "all") count++;
  if (filters.urgent !== "all") count++;
  return count;
}
