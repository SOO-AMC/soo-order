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
  amount: { label: "지출", color: "var(--chart-1)" },
} satisfies ChartConfig;

const won = (n: number) => `${n.toLocaleString()}원`;

export function SpendChart({ data }: { data: SpendData }) {
  const empty = data.monthly.every((m) => m.amount === 0);
  // 이번 달은 아직 진행 중이므로 지난달 "같은 날짜까지"와 비교한다 (한 달 전체와 비교하면 늘 줄어든 것처럼 보임)
  const diff = data.lastMonthToDateAmount > 0 ? data.thisMonthAmount - data.lastMonthToDateAmount : 0;
  const day = Number(data.asOf.slice(8, 10));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-[15px] font-bold">지출 추이</CardTitle>
        <p className="text-xs text-muted-foreground">
          확정한 명세서 금액의 합계예요. 거래처원장과 같은 숫자 · 이번 달 명세서 {data.invoiceCountThisMonth.toLocaleString()}장
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {empty ? (
          <p className="text-sm text-muted-foreground">
            최근 6개월에 확정한 명세서가 없어요. 명세서 스캔에서 명세서를 확정하면 여기에 합계가 나와요.
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-3">
              <div>
                <p className="text-xs text-muted-foreground">이번 달 (1일 ~ {day}일)</p>
                <p className="text-lg font-bold">{won(data.thisMonthAmount)}</p>
              </div>
              {data.lastMonthToDateAmount > 0 && Math.abs(diff) > 0 && (
                <p className={diff > 0 ? "text-xs text-status-late" : "text-xs text-status-done"}>
                  {diff > 0 ? "▲" : "▼"} 지난달 {day}일까지보다 {won(Math.abs(diff))}
                </p>
              )}
            </div>
            <ChartContainer id="spend" config={chartConfig} className="aspect-auto h-[200px] w-full">
              <BarChart data={data.monthly} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} tickFormatter={(v) => `${Math.round(Number(v) / 10000)}만`} />
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
