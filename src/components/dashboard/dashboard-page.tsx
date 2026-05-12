"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StatCards } from "./stat-cards";
import { StatusDonut } from "./status-donut";
import { RecentOrders } from "./recent-orders";
import { AlertPanel } from "./alert-panel";
import { LeadTimeCard } from "./lead-time-card";
import { SpendChart } from "./spend-chart";
import { OrderTrendChart } from "./order-trend-chart";
import { TopItemsChart } from "./top-items-chart";
import { VendorStatusChart } from "./vendor-status-chart";
import { ReturnAnalysisChart } from "./return-analysis-chart";
import { fetchDashboardData } from "@/lib/actions/dashboard-action";
import type { DashboardData } from "@/lib/types/dashboard";

export function DashboardPage({ initialData }: { initialData?: DashboardData }) {
  const [data, setData] = useState<DashboardData | null>(initialData ?? null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchDashboardData()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-card px-4 py-3 shadow-header">
        <Button variant="ghost" size="icon" asChild className="lg:hidden">
          <Link href="/more">
            <ChevronLeft />
          </Link>
        </Button>
        <div>
          <h1 className="text-lg font-bold leading-tight">대시보드</h1>
          <p className="hidden text-xs text-muted-foreground sm:block">오늘의 주문·검수 현황과 주요 지표를 한눈에</p>
        </div>
      </header>

      {error ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-destructive">데이터를 불러올 수 없습니다.</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      ) : !data ? (
        <div className="flex items-center justify-center py-16">
          <Spinner text="불러오는 중..." />
        </div>
      ) : (
        <div className="space-y-4 p-4">
          <StatCards summary={data.summary} spend={data.spend} />

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <OrderTrendChart daily={data.dailyTrend} weekly={data.weeklyTrend} monthly={data.monthlyTrend} />
            </div>
            <StatusDonut data={data.summary} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {data.recentOrders && <RecentOrders data={data.recentOrders} />}
            {data.alerts && <AlertPanel data={data.alerts} />}
          </div>

          {data.leadTime && <LeadTimeCard data={data.leadTime} />}
          {data.spend && <SpendChart data={data.spend} />}

          <div className="grid gap-4 lg:grid-cols-2">
            <TopItemsChart data={data.topItems} />
            <VendorStatusChart data={data.vendors} />
          </div>

          <ReturnAnalysisChart data={data.returnAnalysis} />
        </div>
      )}
    </div>
  );
}
