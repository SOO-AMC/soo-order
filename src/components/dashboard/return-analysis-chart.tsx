"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ReturnAnalysisData } from "@/lib/types/dashboard";

const barConfig: ChartConfig = {
  count: { label: "반품 수", color: "var(--chart-bad)" },
};

interface ReturnAnalysisChartProps {
  data: ReturnAnalysisData;
}

export function ReturnAnalysisChart({ data }: ReturnAnalysisChartProps) {
  if (data.totalInspected === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-[15px] font-bold">반품 분석</CardTitle>
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
        <CardTitle className="text-[15px] font-bold">반품 분석</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 반품률: 한 숫자가 주인공 → 큰 숫자 + 막대 미터 */}
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-[26px] font-extrabold leading-8 tracking-tight tabular-nums">{data.returnRate.toFixed(1)}%</span>
            <span className="text-[13px] text-muted-foreground">반품률</span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-label="반품률"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Number(data.returnRate.toFixed(1))}
          >
            <div className="h-full rounded-full bg-[var(--chart-bad)]" style={{ width: `${Math.min(100, Math.max(data.returnRate, data.totalReturned > 0 ? 1 : 0))}%` }} />
          </div>
          <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
            검수 {data.totalInspected.toLocaleString()}건 중 반품 {data.totalReturned.toLocaleString()}건
          </p>
        </div>

        {/* 품목별 반품 TOP */}
        {data.topItems.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">반품 품목 TOP</p>
            <ChartContainer id="return-top-items" config={barConfig} className="aspect-auto w-full" style={{ height: Math.max(120, data.topItems.length * 28) }}>
              <BarChart data={data.topItems} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  width={80}
                  fontSize={12}
                  tickFormatter={(v: string) => (v.length > 6 ? v.slice(0, 6) + "…" : v)}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
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
                    <span className="text-xs text-muted-foreground ml-2 shrink-0">{r.date}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.reason}</p>
                  <p className="text-xs text-muted-foreground">{r.requester}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
