"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SummaryCards } from "./summary-cards";
import { OrderTrendChart } from "./order-trend-chart";
import { TopItemsChart } from "./top-items-chart";
import { VendorStatusChart } from "./vendor-status-chart";
import { ReturnAnalysisChart } from "./return-analysis-chart";
import { fetchDashboardData } from "@/lib/actions/dashboard-action";
import type { DashboardData } from "@/lib/types/dashboard";

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchDashboardData()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-card px-4 py-3 shadow-header">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild className="lg:hidden">
            <Link href="/more">
              <ChevronLeft />
            </Link>
          </Button>
          <h1 className="text-lg font-bold">대시보드</h1>
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
          <SummaryCards data={data.summary} />

          <OrderTrendChart
            daily={data.dailyTrend}
            weekly={data.weeklyTrend}
            monthly={data.monthlyTrend}
          />

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
