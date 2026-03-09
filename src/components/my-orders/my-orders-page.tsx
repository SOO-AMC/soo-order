"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchMyOrdersStatus, type MyOrdersData } from "@/lib/actions/my-orders-action";
import { StatusSummary } from "./status-summary";
import { ActiveOrderList } from "./active-order-list";
import { RecentCompleted } from "./recent-completed";

export function MyOrdersPage() {
  const [data, setData] = useState<MyOrdersData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyOrdersStatus()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-card px-4 py-3 shadow-header">
        <h1 className="text-lg font-bold">내 주문 현황</h1>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data || (data.activeOrders.length === 0 && data.recentCompleted.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-sm text-muted-foreground">주문 내역이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-6 p-4">
          <StatusSummary counts={data.counts} />

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">진행중인 내 주문</h2>
            <ActiveOrderList orders={data.activeOrders} />
          </div>

          <RecentCompleted orders={data.recentCompleted} />
        </div>
      )}
    </div>
  );
}
