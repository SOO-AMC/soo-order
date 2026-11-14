"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { Skeleton, EmptyState } from "@/components/workspace/feedback";
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
import { shareInflight } from "@/lib/utils/inflight";
import type { DashboardData } from "@/lib/types/dashboard";

export function DashboardPage({ initialData }: { initialData?: DashboardData }) {
  const [data, setData] = useState<DashboardData | null>(initialData ?? null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    shareInflight("dashboard-data", fetchDashboardData)
      .then((d) => { if (active) setData(d); })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-[1400px]">
      <PageHeader
        title="대시보드"
        description={<span className="hidden sm:inline">주문·검수 현황과 주요 지표</span>}
        leading={
          <div className="lg:hidden">
            <BackButton fallbackHref="/more" />
          </div>
        }
        action={
          <Button asChild variant="outline" className="h-9 rounded-lg px-3 text-[13px]">
            <Link href="/todo">
              <Inbox className="size-4" />
              처리할 일
            </Link>
          </Button>
        }
      />

      {error ? (
        <div className="p-4 lg:px-6">
          <div className="rounded-xl bg-card ring-1 ring-border">
            <EmptyState title="대시보드를 불러오지 못했어요" description={error} />
          </div>
        </div>
      ) : !data ? (
        <div className="space-y-4 p-4 lg:px-6" aria-label="불러오는 중">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-72 rounded-xl lg:col-span-2" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </div>
      ) : (
        <div className="space-y-4 p-4 lg:px-6">
          <StatCards summary={data.summary} spend={data.spend} />

          <div className="grid gap-4 lg:grid-cols-3 lg:items-start [&>*]:min-w-0">
            <div className="lg:col-span-2">
              <OrderTrendChart daily={data.dailyTrend} weekly={data.weeklyTrend} monthly={data.monthlyTrend} />
            </div>
            <StatusDonut data={data.summary} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2 lg:items-start [&>*]:min-w-0">
            {data.recentOrders && <RecentOrders data={data.recentOrders} />}
            {data.alerts && <AlertPanel data={data.alerts} />}
          </div>

          {data.leadTime && <LeadTimeCard data={data.leadTime} />}
          {data.spend && <SpendChart data={data.spend} />}

          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <TopItemsChart data={data.topItems} />
            <VendorStatusChart data={data.vendors} />
          </div>

          <ReturnAnalysisChart data={data.returnAnalysis} />
        </div>
      )}
    </div>
  );
}
