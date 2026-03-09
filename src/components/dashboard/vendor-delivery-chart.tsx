"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatHours } from "@/lib/utils/format";
import type { VendorDeliverySpeed } from "@/lib/types/dashboard";

const chartConfig = {
  medianHours: {
    label: "중앙값",
    color: "#2563EB",
  },
  avgHours: {
    label: "평균",
    color: "#1D4ED8",
  },
} satisfies ChartConfig;

interface Props {
  data: VendorDeliverySpeed[];
}

export function VendorDeliveryChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">업체별 납품 속도</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">데이터가 없습니다.</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.slice(0, 15);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">업체별 납품 속도</CardTitle>
        <p className="text-xs text-muted-foreground">
          발주 → 검수 소요 시간 (중앙값 기준, 3건 이상)
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ChartContainer
          id="vendor-delivery"
          config={chartConfig}
          className="aspect-auto h-[300px] w-full"
        >
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 20, bottom: 0, left: 0 }}
          >
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              fontSize={11}
              tickFormatter={(v: number) => formatHours(v)}
            />
            <YAxis
              type="category"
              dataKey="vendor"
              tickLine={false}
              axisLine={false}
              width={80}
              fontSize={11}
              tickFormatter={(v: string) =>
                v.length > 7 ? v.slice(0, 7) + "…" : v
              }
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => formatHours(value as number)}
                />
              }
            />
            <Bar dataKey="medianHours" fill="#2563EB" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartContainer>

        <div className="max-h-[200px] space-y-1 overflow-y-auto">
          {data.map((v) => (
            <div
              key={v.vendor}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <span className="font-medium truncate">{v.vendor}</span>
              <div className="flex gap-3 shrink-0 text-xs text-muted-foreground">
                <span>중앙값 {formatHours(v.medianHours)}</span>
                <span>평균 {formatHours(v.avgHours)}</span>
                <span>{v.count}건</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
