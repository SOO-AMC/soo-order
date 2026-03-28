"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface TabInfo {
  count: number;
  hasUrgent: boolean;
}

interface TabCounts {
  orders: TabInfo;
  outOfStock: TabInfo;
  returns: TabInfo;
  inspection: TabInfo;
  blood: TabInfo;
}

const empty: TabInfo = { count: 0, hasUrgent: false };
const defaultCounts: TabCounts = { orders: empty, outOfStock: empty, returns: empty, inspection: empty, blood: empty };

// Context로 공유하여 BottomNav + AppSidebar 중복 호출 방지
const TabCountsContext = createContext<TabCounts>(defaultCounts);

export function useTabCounts() {
  return useContext(TabCountsContext);
}

export { TabCountsContext };

export function useTabCountsProvider() {
  const [counts, setCounts] = useState<TabCounts>(defaultCounts);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCounts = useCallback(async () => {
    const supabase = createClient();

    const [ordersRes, bloodRes] = await Promise.all([
      supabase
        .from("orders")
        .select("status, is_urgent, type")
        .in("status", ["pending", "ordered", "return_requested", "return_pending", "out_of_stock"]),
      supabase
        .from("blood_records")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

    const rows = ordersRes.data ?? [];

    const tally = (
      filterFn: (r: { status: string; is_urgent: boolean; type: string }) => boolean
    ) => rows.filter(filterFn).length;

    setCounts({
      orders: {
        count: tally((r) => r.type === "order" && r.status === "pending"),
        hasUrgent: rows.some((r) => r.type === "order" && r.status === "pending" && r.is_urgent),
      },
      inspection: {
        count: tally((r) => r.status === "ordered"),
        hasUrgent: rows.some((r) => r.status === "ordered" && r.is_urgent),
      },
      returns: {
        count: tally((r) => r.status === "return_requested" || r.status === "return_pending"),
        hasUrgent: rows.some((r) => (r.status === "return_requested" || r.status === "return_pending") && r.is_urgent),
      },
      outOfStock: {
        count: tally((r) => r.status === "out_of_stock"),
        hasUrgent: rows.some((r) => r.status === "out_of_stock" && r.is_urgent),
      },
      blood: { count: bloodRes.count ?? 0, hasUrgent: false },
    });
  }, []);

  const debouncedFetch = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fetchCounts, 500);
  }, [fetchCounts]);

  useEffect(() => {
    // 초기 렌더링 차단 방지: idle 상태에서 카운트 fetch
    const scheduleInitialFetch = () => {
      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(() => fetchCounts());
      } else {
        setTimeout(fetchCounts, 100);
      }
    };
    scheduleInitialFetch();

    const supabase = createClient();
    const channel = supabase
      .channel("tab-counts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        debouncedFetch
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "blood_records" },
        debouncedFetch
      )
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchCounts, debouncedFetch]);

  return counts;
}
