"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface TabInfo {
  count: number;
  hasUrgent: boolean;
}

interface TabCounts {
  orders: TabInfo;
  returns: TabInfo;
  inspection: TabInfo;
}

const empty: TabInfo = { count: 0, hasUrgent: false };
const defaultCounts: TabCounts = { orders: empty, returns: empty, inspection: empty };

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

    // 2개 쿼리로 통합: 상태별 전체 카운트 + 긴급 카운트
    const [pending, returnReq, ordered, pendingUrgent, returnReqUrgent, orderedUrgent] =
      await Promise.all([
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("type", "order")
          .eq("status", "pending"),
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("status", "return_requested"),
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("status", "ordered"),
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("type", "order")
          .eq("status", "pending")
          .eq("is_urgent", true),
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("status", "return_requested")
          .eq("is_urgent", true),
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("status", "ordered")
          .eq("is_urgent", true),
      ]);

    setCounts({
      orders: { count: pending.count ?? 0, hasUrgent: (pendingUrgent.count ?? 0) > 0 },
      returns: { count: returnReq.count ?? 0, hasUrgent: (returnReqUrgent.count ?? 0) > 0 },
      inspection: { count: ordered.count ?? 0, hasUrgent: (orderedUrgent.count ?? 0) > 0 },
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
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchCounts, debouncedFetch]);

  return counts;
}
