"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { TopItemData } from "@/lib/types/dashboard";

const chartConfig = {
  count: {
    label: "주문 수",
    color: "#7B3FC5",
  },
} satisfies ChartConfig;

interface TopItemsChartProps {
  data: TopItemData[];
}

export function TopItemsChart({ data }: TopItemsChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">품목 TOP 10</CardTitle>
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
        <CardTitle className="text-base">품목 TOP 10</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer id="top-items" config={chartConfig} className="aspect-auto h-[300px] w-full">
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, bottom: 0, left: 0 }}>
            <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="name"
              tickLine={false}
              axisLine={false}
              width={100}
              fontSize={11}
              tickFormatter={(v: string) => (v.length > 8 ? v.slice(0, 8) + "…" : v)}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="#7B3FC5" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
