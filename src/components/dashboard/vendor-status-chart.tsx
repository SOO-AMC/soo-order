"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { VendorData } from "@/lib/types/dashboard";

const chartConfig = {
  total: {
    label: "발주 건수",
    color: "#2563EB",
  },
  invoiceReceived: {
    label: "명세서 수령",
    color: "#1D4ED8",
  },
} satisfies ChartConfig;

interface VendorStatusChartProps {
  data: VendorData[];
}

export function VendorStatusChart({ data }: VendorStatusChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">업체별 발주 현황</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">데이터가 없습니다.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">업체별 발주 현황</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer id="vendor-status" config={chartConfig} className="aspect-auto h-[300px] w-full">
          <BarChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="vendor"
              tickLine={false}
              axisLine={false}
              fontSize={11}
              tickFormatter={(v: string) => (v.length > 6 ? v.slice(0, 6) + "…" : v)}
            />
            <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="invoiceReceived" fill="var(--color-invoiceReceived)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
