"use client";

import { Cell, Pie, PieChart, Bar, BarChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ReturnAnalysisData } from "@/lib/types/dashboard";

const donutConfig: ChartConfig = {
  반품: { label: "반품", color: "#ef4444" },
  정상: { label: "정상", color: "#22c55e" },
};

const barConfig: ChartConfig = {
  count: { label: "반품 수", color: "#ef4444" },
};

interface ReturnAnalysisChartProps {
  data: ReturnAnalysisData;
}

export function ReturnAnalysisChart({ data }: ReturnAnalysisChartProps) {
  const donutData = [
    { name: "반품", value: data.totalReturned },
    { name: "정상", value: data.totalInspected - data.totalReturned },
  ];

  if (data.totalInspected === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">반품 분석</CardTitle>
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
        <CardTitle className="text-base">반품 분석</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 반품률 도넛 */}
        <div className="text-center">
          <ChartContainer id="return-donut" config={donutConfig} className="mx-auto aspect-square h-[140px]">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie
                data={donutData}
                dataKey="value"
                nameKey="name"
                innerRadius={40}
                outerRadius={60}
                strokeWidth={2}
              >
                <Cell fill="#ef4444" />
                <Cell fill="#22c55e" />
              </Pie>
            </PieChart>
          </ChartContainer>
          <p className="text-lg font-bold">{data.returnRate.toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground">
            반품률 ({data.totalReturned}/{data.totalInspected})
          </p>
        </div>

        {/* 품목별 반품 TOP */}
        {data.topItems.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">반품 품목 TOP</p>
            <ChartContainer id="return-top-items" config={barConfig} className="aspect-auto w-full" style={{ height: Math.max(120, data.topItems.length * 28) }}>
              <BarChart data={data.topItems} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                <XAxis type="number" tickLine={false} axisLine={false} fontSize={10} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  width={80}
                  fontSize={10}
                  tickFormatter={(v: string) => (v.length > 6 ? v.slice(0, 6) + "…" : v)}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          </div>
        )}

        {/* 최근 반품 사유 */}
        {data.recentReasons.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">최근 반품 사유</p>
            <div className="max-h-[200px] space-y-2 overflow-y-auto">
              {data.recentReasons.map((r, i) => (
                <div key={i} className="rounded-lg border p-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate flex-1">{r.itemName}</span>
                    <span className="text-[10px] text-muted-foreground ml-2 shrink-0">{r.date}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.reason}</p>
                  <p className="text-[10px] text-muted-foreground">{r.requester}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
