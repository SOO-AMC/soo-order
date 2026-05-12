"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { SpendData } from "@/lib/types/dashboard";

const chartConfig = {
  amount: { label: "추정 지출", color: "#2563EB" },
} satisfies ChartConfig;

const won = (n: number) => `${n.toLocaleString()}원`;

export function SpendChart({ data }: { data: SpendData }) {
  const empty = data.monthly.every((m) => m.amount === 0);
  const coverage = data.totalCount > 0 ? Math.round((data.matchedCount / data.totalCount) * 100) : 0;
  const diff = data.lastMonthAmount > 0 ? data.thisMonthAmount - data.lastMonthAmount : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">지출 추이 (추정)</CardTitle>
        <p className="text-xs text-muted-foreground">
          가격비교 단가 × 수량 기준 추정치. 매칭률 {coverage}% ({data.matchedCount}/{data.totalCount}건)
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {empty ? (
          <p className="text-sm text-muted-foreground">
            가격 매칭된 주문이 없어 추정할 데이터가 없습니다. 가격비교에 제품을 등록하고 &quot;품목 매칭&quot;을 쌓으면 표시됩니다.
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-3">
              <div>
                <p className="text-xs text-muted-foreground">이번 달 추정</p>
                <p className="text-lg font-bold">{won(data.thisMonthAmount)}</p>
              </div>
              {data.lastMonthAmount > 0 && Math.abs(diff) > 0 && (
                <p className={diff > 0 ? "text-xs text-red-600" : "text-xs text-green-700"}>
                  {diff > 0 ? "▲" : "▼"} 지난달 대비 {won(Math.abs(diff))}
                </p>
              )}
            </div>
            <ChartContainer id="spend" config={chartConfig} className="aspect-auto h-[200px] w-full">
              <BarChart data={data.monthly} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={48} tickFormatter={(v) => `${Math.round(Number(v) / 10000)}만`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="amount" fill="var(--color-amount)" radius={4} />
              </BarChart>
            </ChartContainer>
            {data.byVendorThisMonth.length > 0 && (
              <div className="text-xs">
                <p className="font-medium text-muted-foreground">이번 달 업체별</p>
                <ul className="mt-1 space-y-0.5">
                  {data.byVendorThisMonth.slice(0, 6).map((v) => (
                    <li key={v.vendor} className="flex justify-between gap-2">
                      <span className="truncate">{v.vendor}</span>
                      <span className="shrink-0 tabular-nums">{won(v.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
