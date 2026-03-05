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

const chartConfig = {
  count: {
    label: "주문 수",
    color: "#15BDF0",
  },
} satisfies ChartConfig;

interface OrderTrendChartProps {
  daily: TrendDataPoint[];
  weekly: TrendDataPoint[];
  monthly: TrendDataPoint[];
}

type Period = "daily" | "weekly" | "monthly";

const PERIOD_LABEL: Record<Period, string> = {
  daily: "일별 (30일)",
  weekly: "주별 (12주)",
  monthly: "월별 (12개월)",
};

export function OrderTrendChart({ daily, weekly, monthly }: OrderTrendChartProps) {
  const [period, setPeriod] = useState<Period>("daily");

  const dataMap: Record<Period, TrendDataPoint[]> = { daily, weekly, monthly };
  const data = dataMap[period];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">주문 추이</CardTitle>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          {Object.entries(PERIOD_LABEL).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </CardHeader>
      <CardContent>
        <ChartContainer id="order-trend" config={chartConfig} className="aspect-auto h-[250px] w-full">
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="fillCount" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#15BDF0" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#15BDF0" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#15BDF0"
              strokeWidth={2}
              fill="url(#fillCount)"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
