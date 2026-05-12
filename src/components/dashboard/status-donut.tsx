"use client";

import { Cell, Pie, PieChart } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import type { SummaryData } from "@/lib/types/dashboard";

const SLICES = [
  { key: "pending", label: "주문신청", color: "#eab308" },
  { key: "ordered", label: "검수대기", color: "#22c55e" },
  { key: "inspecting", label: "검수완료", color: "#3b82f6" },
  { key: "returnRequested", label: "반품신청", color: "#f97316" },
] as const;

export function StatusDonut({ data }: { data: SummaryData }) {
  const counts: Record<string, number> = {
    pending: data.pending,
    ordered: data.ordered,
    inspecting: data.inspecting,
    returnRequested: data.returnRequested,
  };
  const rows = SLICES.map((s) => ({ ...s, value: counts[s.key] ?? 0 })).filter((r) => r.value > 0);
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  const config: ChartConfig = Object.fromEntries(SLICES.map((s) => [s.key, { label: s.label, color: s.color }]));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">주문 상태 분포</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">진행 중인 주문이 없습니다.</p>
        ) : (
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <ChartContainer id="status-donut" config={config} className="h-[150px] w-[150px]">
                <PieChart>
                  <Pie data={rows} dataKey="value" nameKey="label" innerRadius={46} outerRadius={68} paddingAngle={2} strokeWidth={0}>
                    {rows.map((r) => (
                      <Cell key={r.key} fill={r.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold leading-none">{total}</span>
                <span className="mt-0.5 text-[10px] text-muted-foreground">전체 진행중</span>
              </div>
            </div>
            <ul className="min-w-0 flex-1 space-y-2 text-sm">
              {rows.map((r) => (
                <li key={r.key} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.label}</span>
                  <span className="font-medium tabular-nums">{Math.round((r.value / total) * 100)}%</span>
                  <span className="text-xs text-muted-foreground">({r.value}건)</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
