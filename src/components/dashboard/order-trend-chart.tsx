"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { TrendDataPoint } from "@/lib/types/dashboard";
import { Segmented } from "@/components/workspace/filter-bar";

const chartConfig = {
  count: {
    label: "주문 수",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

interface OrderTrendChartProps {
  daily: TrendDataPoint[];
  weekly: TrendDataPoint[];
  monthly: TrendDataPoint[];
}

type Period = "daily" | "weekly" | "monthly";

const PERIOD_ITEMS: { value: Period; label: string }[] = [
  { value: "daily", label: "30일" },
  { value: "weekly", label: "12주" },
  { value: "monthly", label: "12개월" },
];

export function OrderTrendChart({ daily, weekly, monthly }: OrderTrendChartProps) {
  const [period, setPeriod] = useState<Period>("daily");

  const dataMap: Record<Period, TrendDataPoint[]> = { daily, weekly, monthly };
  const data = dataMap[period];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-[15px] font-bold">주문 추이</CardTitle>
        <Segmented<Period> ariaLabel="기간" items={PERIOD_ITEMS} value={period} onValueChange={setPeriod} />
      </CardHeader>
      <CardContent>
        <ChartContainer id="order-trend" config={chartConfig} className="aspect-auto h-[250px] w-full">
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="fillCount" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone"
              dataKey="count"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#fillCount)"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
