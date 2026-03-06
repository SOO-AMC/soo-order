"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SummaryCards } from "./summary-cards";
import { OrderTrendChart } from "./order-trend-chart";
import { TopItemsChart } from "./top-items-chart";
import { VendorStatusChart } from "./vendor-status-chart";
import { ReturnAnalysisChart } from "./return-analysis-chart";
import { ReorderIntervalChart } from "./reorder-interval-chart";
import { ItemVendorTable } from "./item-vendor-table";
import { VendorDeliveryChart } from "./vendor-delivery-chart";
import type { DashboardData } from "@/lib/types/dashboard";

interface DashboardPageProps {
  data: DashboardData;
}

export function DashboardPage({ data }: DashboardPageProps) {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-none">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-background/95 backdrop-blur-sm px-4 py-3 shadow-header">
        <Button variant="ghost" size="icon" asChild className="lg:hidden">
          <Link href="/more">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">대시보드</h1>
      </header>

      <div className="space-y-4 p-4">
        {/* Row 1: Summary Cards */}
        <SummaryCards data={data.summary} />

        {/* Row 2: Order Trend */}
        <OrderTrendChart
          daily={data.dailyTrend}
          weekly={data.weeklyTrend}
          monthly={data.monthlyTrend}
        />

        {/* Row 3: Top Items + Vendor */}
        <div className="grid gap-4 lg:grid-cols-2">
          <TopItemsChart data={data.topItems} />
          <VendorStatusChart data={data.vendors} />
        </div>

        {/* Row 4: Return Analysis */}
        <ReturnAnalysisChart data={data.returnAnalysis} />

        {/* Row 5: Reorder Interval */}
        {data.firebase && (
          <ReorderIntervalChart data={data.firebase.reorderIntervals} />
        )}

        {/* Row 6: Item-Vendor + Vendor Delivery */}
        {data.firebase && (
          <div className="grid gap-4 lg:grid-cols-2">
            <ItemVendorTable data={data.firebase.itemVendorMappings} />
            <VendorDeliveryChart data={data.firebase.vendorDeliverySpeeds} />
          </div>
        )}
      </div>
    </div>
  );
}
